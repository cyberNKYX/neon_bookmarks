import { getBaseUrl, lock, isLocked, unlock } from "./utils.js";
export async function fetchTabDescription() {
    try {
        // 获取当前活动标签页
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

        // 在标签页中执行脚本
        const result = await chrome.scripting.executeScript({
            target: { tabId: activeTab.id },
            func: () => {
                const metaTag = document.querySelector('meta[name="description"]');
                return metaTag ? metaTag.getAttribute("content") : "No description found.";
            },
        });

        // 返回描述
        return result[0]?.result || "Unable to fetch description.";
    } catch (error) {
        console.error("Error fetching tab description:", error);
        return "An error occurred while fetching the description.";
    }
}

export async function fetchBookmarks() {
    try {
        // 获取书签树
        const bookmarkTreeNodes = await new Promise((resolve, reject) => {
            chrome.bookmarks.getTree((result) => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve(result);
                }
            });
        });

        // 处理书签
        return flattenBookmarks(bookmarkTreeNodes);
    } catch (error) {
        console.error("Error fetching bookmarks:", error);
        return [];
    }
}


function parseSiteOrPage(url) {
    const base_url = getBaseUrl(url);
    if (Math.abs(base_url.length - url.length) >= 3) {
        return "page";
    } else {
        return "site";
    }
}

export async function fetchAllDescriptions(bookmarks, force = false) {
    if (await isLocked()) {
        console.log("别的地方在fetch description 中，跳过");
        const complete = await getScanningCache();
        console.log("scanning is complete");
        return;
    }

    await lock();

    resetScanningCache();

    const filteredBookmarks = bookmarks.filter(bookmark => bookmark.url);

    let max_count = 1000;
    for (let i = 0; i < Math.min(max_count, filteredBookmarks.length); i++) {
        const bookmark = filteredBookmarks[i];
        try {
            const desc = await fetchDescription(bookmark.url, force = force);
            bookmark.desc = desc;
        } catch (error) {
            bookmark.desc = "dead";
            console.error(`Failed to fetch description for ${bookmark.url}:`, error);
        }

        const progress = Math.round((i + 1) / Math.min(max_count, filteredBookmarks.length) * 100);
        try {
            await chrome.runtime.sendMessage({ type: 'fetchProgress', progress });
        } catch (error) {
            console.log('No listeners for progress updates');
        }
    }

    setScanningCache();

    await unlock();
}

export async function fetchDescription(url, force = false) {
    const cachedDescription = await fetchDescriptionFromCache(url);
    if (cachedDescription && !force) {
        return cachedDescription;
    }


    const desc = await fetchDescriptionFromNetwork(url);
    console.log("Fetching description from network for " + url + ": " + desc);
    return desc;
}

async function fetchDescriptionFromCache(url) {
    return new Promise((resolve) => {
        chrome.storage.sync.get(url, (result) => {
            if (result[url]) {
                const { description, timestamp } = result[url];
                const now = Date.now();
                const expirationTime = 7 * 24 * 60 * 60 * 1000; // 7 days + a random number between 0-1 minute
                if (now - timestamp < expirationTime) {
                    resolve(description);
                    return;
                }
            }
            resolve(null); // 如果没有缓存或已过期，返回 null
        });
    });
}


async function fetchDescriptionFromNetwork(url) {
    try {
        const base_url = getBaseUrl(url);
        const response = await fetch("https://api.dub.co/metatags?url=" + base_url);
        const result = await response.json();
        var description = result.description;
        if (description == "No description" && result.title == base_url) {
            description = "dead";
        }
        await setDescriptionCache(url, description);
        return description;
    } catch (err) {
        await setDescriptionCache(url, "dead");
        console.error("Error fetching description:", err);
        return "dead";
    }
}

// 设置缓存
async function setDescriptionCache(url, description) {
    const timestamp = Date.now();
    return new Promise((resolve) => {
        chrome.storage.sync.set({ [url]: { description, timestamp } }, () => {
            resolve();
        });
    });
}

async function setScanningCache() {
    return new Promise((resolve) => {
        chrome.storage.sync.set({ "scanning_complete": true }, () => {
            resolve();
        });
    });
}

export async function getScanningCache() {
    return new Promise((resolve) => {
        chrome.storage.sync.get("scanning_complete", (result) => {
            if (result["scanning_complete"]) {
                return resolve(true);
            }
            resolve(false); // 如果没有缓存或已过期，返回 null
        });
    });
}

async function resetScanningCache() {
    return new Promise((resolve) => {
        chrome.storage.sync.remove("scanning_complete", () => {
            resolve();
        });
    });
}

function flattenBookmarks(bookmarkItems) {
    const allBookmarks = [];

    // 使用栈来模拟递归
    const stack = [...bookmarkItems];

    while (stack.length > 0) {
        const bookmark = stack.pop();

        if (bookmark.url) {
            const siteOrPage = parseSiteOrPage(bookmark.url);
            bookmark.siteOrPage = siteOrPage;
            allBookmarks.push(bookmark);
        }

        if (bookmark.children && bookmark.children.length > 0) {
            stack.push(...bookmark.children);
        }
    }

    return allBookmarks;
}
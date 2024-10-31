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
        return;
    }

    await lock();
    const filteredBookmarks = bookmarks.filter(bookmark => bookmark.url);

    for (const bookmark of filteredBookmarks) {
        const siteOrPage = parseSiteOrPage(bookmark.url);
        bookmark.siteOrPage = siteOrPage;
        try {
            const desc = await fetchDescription(bookmark.url, force = force);
            bookmark.desc = desc;
        } catch (error) {
            bookmark.desc = "Failed";
            console.error(`Failed to fetch description for ${bookmark.url}:`, error);
        }
    }

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
        chrome.storage.local.get(url, (result) => {
            if (result[url]) {
                const { description, timestamp } = result[url];
                const now = Date.now();
                const expirationTime = 7 * 24 * 60 * 60 * 1000; // 7 days
                if (now - timestamp < expirationTime) {
                    resolve(description);
                    return;
                }
            }
            resolve(null); // 如果没有缓存或已过期，返回 null
        });
    });
}



function extractMetaDescription(html) {
    const metaDescriptionRegex = /<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i;
    const match = html.match(metaDescriptionRegex);
    return match ? match[1] : "No description";
}


async function fetchDescriptionFromNetwork(url) {
    try {
        const base_url = getBaseUrl(url);
        const response = await fetch(base_url);
        const html = await response.text();
        const description = extractMetaDescription(html);
        await setDescriptionCache(url, description);
        return description;
    } catch (err) {
        await setDescriptionCache(url, "Failed");
        console.error("Error fetching description:", err);
        return "Failed";
    }
}

// 设置缓存
async function setDescriptionCache(url, description) {
    const timestamp = Date.now();
    return new Promise((resolve) => {
        chrome.storage.local.set({ [url]: { description, timestamp } }, () => {
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
            allBookmarks.push(bookmark);
        }

        if (bookmark.children && bookmark.children.length > 0) {
            stack.push(...bookmark.children);
        }
    }

    return allBookmarks;
}
import { getBaseUrl, lock, isLocked, unlock, timer } from "./utils.js";


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
        return await processBookmarks(bookmarkTreeNodes);
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


export async function checkAllDeadLinks(bookmarks) {
    if (await isLocked()) {
        console.log("Scanning is ongoing, skip!");
        return;
    }
    await lock();
    resetScanningProgress();
    const filteredBookmarks = bookmarks.filter(bookmark => bookmark.url);

    let max_count = 10000;
    for (let i = 0; i < Math.min(max_count, filteredBookmarks.length); i++) {
        const bookmark = filteredBookmarks[i];
        try {
            const status = await checkDeadLink(bookmark.url);
            bookmark.status = status;
        } catch (error) {
            bookmark.status = "dead";
        }

        const progress = Math.round((i + 1) / Math.min(max_count, filteredBookmarks.length) * 100);
        try {
            await setScanningProgress(progress);
            await chrome.runtime.sendMessage({ type: "SCANNING_PROGRESS_UPDATE" });
        } catch (error) {
            console.log('No listeners for progress updates');
        }
        await timer(100);
    }

    await unlock();
}

export async function checkDeadLink(url) {
    let status = await checkDeadLinkFromCache(url);
    if (status) {
        return status;
    }
    status = await checkDeadLinkFromNetwork(url);
    console.log(`${url} is ${status}`);
    return status;
}

async function checkDeadLinkFromCache(url, check_expire = true) {
    return new Promise((resolve) => {
        chrome.storage.local.get(url, (result) => {
            if (result[url]) {
                const { status, timestamp } = result[url];
                const now = Date.now();
                // const expirationTime = 7 * 24 * 60 * 60 * 1000;
                const expirationTime = 1;
                if (now - timestamp < expirationTime || !check_expire) {
                    resolve(status);
                    return;
                }
            }
            resolve(null); // 如果没有缓存或已过期，返回 null
        });
    });
}


async function checkDeadLinkFromNetwork(url) {
    try {
        const response = await fetch(url, { method: 'GET', mode: 'cors', cache: 'no-cache', redirect: 'follow' });
        if (response.status == 200) {
            await setBookmarkStatusCache(url, "alive");
            return "alive";
        } else {
            await setBookmarkStatusCache(url, "dead");
            return "dead";

        }
    } catch (err) {
        console.error(err);
        await setBookmarkStatusCache(url, "dead");
        return "dead";
    }
}

async function setBookmarkStatusCache(url, status) {
    const timestamp = Date.now();
    return new Promise((resolve) => {
        chrome.storage.local.set({ [url]: { status, timestamp } }, () => {
            resolve();
        });
    });
}

async function setScanningProgress(progress) {
    const timestamp = Date.now();
    return new Promise((resolve) => {
        chrome.storage.local.set({ scanning_progress: { progress, timestamp } }, () => {
            resolve();
        });
    });
}

export async function getScanningProgress() {
    return new Promise((resolve) => {
        chrome.storage.local.get("scanning_progress", (result) => {
            if (result["scanning_progress"]) {
                const { progress, timestamp } = result["scanning_progress"];
                return resolve({ progress, timestamp });
            }
            resolve({ progress: -1, timestamp: Date.now() }); // 如果没有
        });
    });
}

async function resetScanningProgress() {
    return new Promise((resolve) => {
        chrome.storage.local.set({ scanning_progress: { progress: 0, timestamp: Date.now() } }, () => {
            resolve();
        });
    });
}

async function processBookmarks(bookmarkItems) {
    const allBookmarks = [];

    // 使用栈来模拟递归
    const stack = [...bookmarkItems];

    let count = 0;
    let max_count = 20000;
    while (stack.length > 0) {
        const bookmark = stack.pop();

        if (bookmark.url) {
            const siteOrPage = parseSiteOrPage(bookmark.url);
            const status = await checkDeadLinkFromCache(bookmark.url, false);

            bookmark.siteOrPage = siteOrPage;
            if (status != null) {
                bookmark.status = status;
            } else {
                bookmark.status = "unknown";
            }
            allBookmarks.push(bookmark);
            count += 1;
            if (count >= max_count) {
                break;
            }

        }

        if (bookmark.children && bookmark.children.length > 0) {
            stack.push(...bookmark.children);
        }
    }
    return allBookmarks;
}


// export async function fetchTabDescription() {
//     try {
//         // 获取当前活动标签页
//         const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

//         // 在标签页中执行脚本
//         const result = await chrome.scripting.executeScript({
//             target: { tabId: activeTab.id },
//             func: () => {
//                 const metaTag = document.querySelector('meta[name="description"]');
//                 return metaTag ? metaTag.getAttribute("content") : "No description found.";
//             },
//         });

//         // 返回描述
//         return result[0]?.result || "Unable to fetch description.";
//     } catch (error) {
//         console.error("Error fetching tab description:", error);
//         return "An error occurred while fetching the description.";
//     }
// }

// export async function fetchAllDescriptions(bookmarks, force = false) {
//     if (await isLocked()) {
//         console.log("别的地方在fetch description 中，跳过");
//         const complete = await getScanningProgress();
//         console.log("scanning is complete");
//         return;
//     }

//     await lock();

//     resetScanningProgress();

//     const filteredBookmarks = bookmarks.filter(bookmark => bookmark.url);

//     let max_count = 1000;
//     for (let i = 0; i < Math.min(max_count, filteredBookmarks.length); i++) {
//         const bookmark = filteredBookmarks[i];
//         try {
//             const desc = await fetchDescription(bookmark.url, force = force);
//             bookmark.desc = desc;
//         } catch (error) {
//             bookmark.desc = "dead";
//             console.error(`Failed to fetch description for ${bookmark.url}:`, error);
//         }

//         const progress = Math.round((i + 1) / Math.min(max_count, filteredBookmarks.length) * 100);
//         try {
//             await setScanningProgress(progress);
//             await chrome.runtime.sendMessage({ type: 'SCAN_PROGRESS_UPDATE' });
//         } catch (error) {
//         }
//     }

//     setScanningProgress();

//     await unlock();
// }

// export async function fetchDescription(url, force = false) {
//     const cachedDescription = await fetchDescriptionFromCache(url);
//     if (cachedDescription && !force) {
//         return cachedDescription;
//     }

//     const fetchFunc = debounce(fetchDescriptionFromNetwork, Math.random() * 3000);
//     const desc = await fetchFunc(url);
//     console.log("Fetching description from network for " + url + ": " + desc);
//     return desc;
// }

// async function fetchDescriptionFromCache(url) {
//     return new Promise((resolve) => {
//         chrome.storage.local.get(url, (result) => {
//             if (result[url]) {
//                 const { description, timestamp } = result[url];
//                 const now = Date.now();
//                 const expirationTime = 7 * 24 * 60 * 60 * 1000; // 7 days + a random number between 0-1 minute
//                 if (now - timestamp < expirationTime) {
//                     resolve(description);
//                     return;
//                 }
//             }
//             resolve(null); // 如果没有缓存或已过期，返回 null
//         });
//     });
// }


// async function fetchDescriptionFromNetwork(url) {
//     try {
//         const base_url = getBaseUrl(url);
//         const response = await fetch("https://api.dub.co/metatags?url=" + base_url);
//         const result = await response.json();
//         var description = result.description;
//         if (description == "No description" && result.title == base_url) {
//             description = "dead";
//         }
//         await setBookmarkStatusCache(url, description);
//         return description;
//     } catch (err) {
//         await setBookmarkStatusCache(url, "dead");
//         console.error("Error fetching description:", err);
//         return "dead";
//     }
// }
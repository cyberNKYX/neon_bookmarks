import { checkAllDeadLinks, fetchBookmarks, checkDeadLink } from "./fetch_data.js";
import { lock, unlock } from "./utils.js";

setInterval(async () => {
    console.log("Rescan dead links every week");
    const bookmarks = await fetchBookmarks();
    await checkAllDeadLinks(bookmarks);
    console.log(bookmarks);
}, 1000 * 60 * 60 * 24 * 7); // 每周执行一次

// 监听书签创建
chrome.bookmarks.onCreated.addListener(async (id, bookmark) => {
    console.log(`Scan upon creating: ${bookmark.url}`);
    await checkDeadLink(bookmark.url);
    try {
        await chrome.runtime.sendMessage({ type: "SCANNING_UPON_CREATION" });
    } catch (error) {
        console.log('No listeners for progress updates');
    }
});

// 监听书签更改
chrome.bookmarks.onChanged.addListener(async (id, changeInfo) => {
    console.log(`Scan upon creating: ${changeInfo.url}`);
    await checkDeadLink(changeInfo.url);
    try {
        await chrome.runtime.sendMessage({ type: 'SCANNING_UPON_CHANGE' });
    } catch (error) {
        console.log('No listeners for progress updates');
    }
});

chrome.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === 'install') {
        console.log("Scan upon first installation");
        await unlock();
        const bookmarks = await fetchBookmarks();
        await checkAllDeadLinks(bookmarks);
        console.log(bookmarks);
    } else if (details.reason === 'update') {
        console.log('Scan upon first update');
        await unlock();
        const bookmarks = await fetchBookmarks();
        await checkAllDeadLinks(bookmarks);
        console.log(bookmarks);
    }
});
import { fetchAllDescriptions, fetchBookmarks, fetchDescription } from "./fetch_data.js";
import { lock, unlock } from "./utils.js";

chrome.runtime.onStartup.addListener(() => {
    console.log('浏览器启动');
    // 在这里执行你的任务
});

setInterval(async () => {
    console.log("每日更新书签描述")
    await unlock();
    const bookmarks = await fetchBookmarks();
    await fetchAllDescriptions(bookmarks, true);
}, 1000 * 60 * 60 * 24); // 每天执行一次

// 监听书签创建
chrome.bookmarks.onCreated.addListener(async (id, bookmark) => {
    console.log('书签创建:', id, bookmark);
    await lock();
    await fetchDescription(bookmark.url);
    await unlock();
});

// 监听书签更改
chrome.bookmarks.onChanged.addListener(async (id, changeInfo) => {
    console.log('书签更改:', id, changeInfo);
    await lock();
    await fetchDescription(changeInfo.url);
    await unlock();
});

chrome.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === 'install') {
        console.log("扩展程序安装, 重新fetch descriptions");
        await unlock();
        const bookmarks = await fetchBookmarks();
        await fetchAllDescriptions(bookmarks, true);
        console.log(bookmarks);
    } else if (details.reason === 'update') {
        console.log('扩展程序更新，重新fetch descriptions');
        await unlock();
        const bookmarks = await fetchBookmarks();
        await fetchAllDescriptions(bookmarks, false);
        console.log(bookmarks);
    }
    // 在这里执行你的任务
});
export function getBaseUrl(url) {
    try {
        const parsedUrl = new URL(url);
        return `${parsedUrl.protocol}//${parsedUrl.hostname}${parsedUrl.port ? ':' + parsedUrl.port : ''}`;
    } catch (error) {
        console.error("Invalid URL", error);
        return null;
    }
}

export function debounce(func, delay) {
    let timeoutId;
    return function (...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
            func.apply(this, args);
        }, delay);
    };
}

export async function isLocked() {
    return new Promise((resolve) => {
        chrome.storage.local.get('fetchLock', (result) => {
            resolve(!!result.fetchLock);
        });
    });
}

export async function lock() {
    console.log("Fetching...")
    return new Promise((resolve) => {
        chrome.storage.local.set({ fetchLock: true }, resolve);
    });
}

export async function unlock() {
    console.log("Fetching end...")
    return new Promise((resolve) => {
        chrome.storage.local.remove('fetchLock', resolve);
    });
}
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
    return async function (...args) {
        clearTimeout(timeoutId);
        return new Promise((resolve) => {
            timeoutId = setTimeout(async () => {
                try {
                    const result = await func.apply(this, args);
                    resolve(result);
                } catch (error) {
                    resolve(Promise.reject(error));
                }
            }, delay);
        });
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
    console.log("Start new scanning...")
    return new Promise((resolve) => {
        chrome.storage.local.set({ fetchLock: true }, resolve);
    });
}

export async function unlock() {
    console.log("Scanning end...")
    return new Promise((resolve) => {
        chrome.storage.local.remove('fetchLock', resolve);
    });
}

export const timer = ms => new Promise(res => setTimeout(res, ms));
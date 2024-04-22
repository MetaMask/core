export interface LocalStorage {
    setItem(key: string, value: string): Promise<void>;
    getItem(key: string): Promise<string | null>;
}

export class InMemoryStorage implements LocalStorage {
    private storage: Record<string, string>;

    constructor() {
        this.storage = {};
    }

    async setItem(key: string, value: string): Promise<void> {
        this.storage[key] = value;
    }

    async getItem(key: string): Promise<string | null> {
        const value = this.storage[key];
        return value !== undefined ? value : null;
    }
}

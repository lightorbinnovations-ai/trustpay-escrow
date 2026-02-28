import { useState, useEffect } from "react";

export interface TelegramUser {
    id: number;
    first_name: string;
    last_name?: string;
    username?: string;
    photo_url?: string;
}

const FALLBACK_USER: TelegramUser = {
    id: 0,
    first_name: "Guest",
};

export function useTelegramUser() {
    const [user, setUser] = useState<TelegramUser>(FALLBACK_USER);

    useEffect(() => {
        const tg = (window as any).Telegram?.WebApp;
        if (tg?.initDataUnsafe?.user) {
            setUser(tg.initDataUnsafe.user as TelegramUser);
        }
    }, []);

    return { user };
}

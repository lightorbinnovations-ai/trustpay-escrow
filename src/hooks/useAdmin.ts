import { useTelegramUser } from "@/hooks/useTelegramUser";

// Admin usernames (lowercase, without @)
const ADMIN_USERNAMES = ["lightorbinnovations"];

export function useAdmin() {
    const { user } = useTelegramUser();
    const isAdmin = !!user.username && ADMIN_USERNAMES.includes(user.username.toLowerCase());
    return { isAdmin };
}

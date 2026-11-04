export interface Me {
  id: string;
  username: string;
  displayName: string;
  email: string;
  emailVerified: boolean;
  status: "pending" | "active" | "rejected" | "suspended" | "banned";
  locale: "auto" | "id" | "en";
  theme: "system" | "light" | "dark";
  createdAt: string;
}

export interface PublicConfig {
  registration: "approval" | "open" | "closed";
  captcha: boolean;
  emailEnabled: boolean;
  defaultLocale: "auto" | "id" | "en";
  deployMode: "lan" | "public";
  chatEnabled: boolean;
}

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Persona Workspace — 界面演示",
  description: "可复用的三栏 Persona Workspace 视觉演示",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}

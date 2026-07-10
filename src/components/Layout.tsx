import type { ReactNode } from 'react';
import Navbar from './Navbar';
import Footer from './Footer';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#0B0F19]">
      <Navbar />
      <main className="flex-1 pt-[56px]">{children}</main>
      <Footer />
    </div>
  );
}

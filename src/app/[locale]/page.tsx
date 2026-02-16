import { Navbar } from '@/components/layout/Navbar';
import { Hero } from '@/components/landing/Hero';
import { HowItWorks } from '@/components/landing/HowItWorks';
import { Features } from '@/components/landing/Features';
import { Parsing } from '@/components/landing/Parsing';
import { BeforeAfter } from '@/components/landing/BeforeAfter';
import { CTA } from '@/components/landing/CTA';
import { Footer } from '@/components/landing/Footer';

export default function LandingPage() {
  return (
    <>
      <Navbar />
      <main className="flex min-h-screen flex-col">
        <Hero />
        <HowItWorks />
        <Features />
        <Parsing />
        <BeforeAfter />
        <CTA />
      </main>
      <Footer />
    </>
  );
}

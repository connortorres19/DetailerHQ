import { SiteHeader } from '@/components/layout/SiteHeader';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { Hero } from '@/components/sections/Hero';
import { Overview } from '@/components/sections/Overview';
import { Features } from '@/components/sections/Features';
import { ProductShowcase } from '@/components/sections/ProductShowcase';
import { HowItWorks } from '@/components/sections/HowItWorks';
import { PhotoBand } from '@/components/sections/PhotoBand';
import { Scope } from '@/components/sections/Scope';
import { Pricing } from '@/components/sections/Pricing';
import { Faq } from '@/components/sections/Faq';
import { Closing } from '@/components/sections/Closing';

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main id="main" tabIndex={-1}>
        <Hero />
        <Overview />
        <Features />
        <ProductShowcase />
        <HowItWorks />
        <PhotoBand />
        <Scope />
        <Pricing />
        <Faq />
        <Closing />
      </main>
      <SiteFooter />
    </>
  );
}

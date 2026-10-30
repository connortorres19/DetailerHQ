import { SiteHeader } from '@/components/layout/SiteHeader';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { CinematicFilm } from '@/components/film/CinematicFilm';
import { Overview } from '@/components/sections/Overview';
import { Features } from '@/components/sections/Features';
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
        <CinematicFilm />
        <Overview />
        <Features />
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

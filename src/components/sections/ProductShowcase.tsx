'use client';

import { useState } from 'react';
import { Container } from '@/components/ui/Container';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { ShowcaseStage } from './ShowcaseStage';
import s from './section.module.css';

// The showcase as a plain tab set: used on phones and tablets, with reduced motion, when the
// film can't load, and before JavaScript runs. On large screens the film plays it instead.
export function ProductShowcase() {
  const [active, setActive] = useState(0);

  return (
    <section id="product" className={`${s.section} ${s.canvas}`} aria-labelledby="product-title">
      <Container>
        <SectionHeading
          id="product-title"
          overline="Inside the product"
          title="What a working day looks like in it."
          align="split"
          intro={<p>These are interface previews built with sample data for fictional businesses. The product is still in development and details will change.</p>}
        />
        <ShowcaseStage active={active} onSelect={setActive} mode="tabs" />
      </Container>
    </section>
  );
}

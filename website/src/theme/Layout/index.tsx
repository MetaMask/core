import React, { type ReactNode } from 'react';
import clsx from 'clsx';
import ErrorBoundary from '@docusaurus/ErrorBoundary';
import {
  PageMetadata,
  SkipToContentFallbackId,
  ThemeClassNames,
} from '@docusaurus/theme-common';
import SkipToContent from '@theme/SkipToContent';
import AnnouncementBar from '@theme/AnnouncementBar';
import Navbar from '@theme/Navbar';
import Footer from '@theme/Footer';
import LayoutProvider from '@theme/Layout/Provider';
import ErrorPageContent from '@theme/ErrorPageContent';
import type { Props } from '@theme/Layout';

/**
 * Swizzled Layout component.
 *
 * Wraps every page with the standard Docusaurus scaffold (skip link,
 * announcement bar, navbar, main content area, footer) while giving us a
 * place to add site-wide customisations in the future.
 */
export default function Layout(props: Props): ReactNode {
  const { children, noFooter, wrapperClassName, title, description } = props;

  return (
    <LayoutProvider>
      <PageMetadata title={title} description={description} />
      <SkipToContent />
      <AnnouncementBar />
      <Navbar />
      <div
        id={SkipToContentFallbackId}
        className={clsx(
          ThemeClassNames.wrapper.main,
          wrapperClassName,
        )}
      >
        <ErrorBoundary fallback={(params) => <ErrorPageContent {...params} />}>
          {children}
        </ErrorBoundary>
      </div>
      {!noFooter && <Footer />}
    </LayoutProvider>
  );
}

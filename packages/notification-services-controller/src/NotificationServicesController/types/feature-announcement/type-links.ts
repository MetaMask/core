// Generic External Link
// We use this to show a link than will open an external web page
export type TypeExternalLinkFields = {
  fields: {
    externalLinkText: string;
    externalLinkUrl: string;
  };
  contentTypeId: 'externalLink';
};

// Extension Link
// We use this to show a link than will open an extension tab
export type TypeExtensionLinkFields = {
  fields: {
    extensionLinkText: string;
    extensionLinkRoute: string;
  };
  contentTypeId: 'extensionLink';
};

// Portfolio Link
// We use this to show a link than will open a portfolio page
export type TypePortfolioLinkFields = {
  fields: {
    portfolioLinkText: string;
    portfolioLinkUrl: string;
  };
  contentTypeId: 'portfolioLink';
};

// Mobile Link
// We use this to show a link than will open an application page
export type TypeMobileLinkFields = {
  fields: {
    mobileLinkText: string;
    mobileLinkUrl: string;
  };
  contentTypeId: 'mobileLink';
};

// Extension Links
export type TypeExtensionLinkFields = {
  fields: {
    extensionLinkText: string;
    extensionLinkRoute: string;
  };
  contentTypeId: 'extensionLink';
};

// Portfolio Links - TODO clean up portfolio links (we don't need 2 different versions)
export type TypeLinkFields = {
  fields: {
    linkText: string;
    linkUrl: string;
    isExternal: boolean;
  };
  contentTypeId: 'link';
};

export type TypeActionFields = {
  fields: {
    actionText: string;
    actionUrl: string;
    isExternal: boolean;
  };
  contentTypeId: 'action';
};

// Mobile Links - TODO unsupported

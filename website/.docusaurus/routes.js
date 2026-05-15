import React from 'react';
import ComponentCreator from '@docusaurus/ComponentCreator';

export default [
  {
    path: '/core/__docusaurus/debug/',
    component: ComponentCreator('/core/__docusaurus/debug/', 'e71'),
    exact: true
  },
  {
    path: '/core/__docusaurus/debug/config/',
    component: ComponentCreator('/core/__docusaurus/debug/config/', '016'),
    exact: true
  },
  {
    path: '/core/__docusaurus/debug/content/',
    component: ComponentCreator('/core/__docusaurus/debug/content/', '8f3'),
    exact: true
  },
  {
    path: '/core/__docusaurus/debug/globalData/',
    component: ComponentCreator('/core/__docusaurus/debug/globalData/', 'c96'),
    exact: true
  },
  {
    path: '/core/__docusaurus/debug/metadata/',
    component: ComponentCreator('/core/__docusaurus/debug/metadata/', 'c80'),
    exact: true
  },
  {
    path: '/core/__docusaurus/debug/registry/',
    component: ComponentCreator('/core/__docusaurus/debug/registry/', 'f7c'),
    exact: true
  },
  {
    path: '/core/__docusaurus/debug/routes/',
    component: ComponentCreator('/core/__docusaurus/debug/routes/', 'abc'),
    exact: true
  },
  {
    path: '/core/',
    component: ComponentCreator('/core/', 'ae2'),
    routes: [
      {
        path: '/core/',
        component: ComponentCreator('/core/', '7ea'),
        routes: [
          {
            path: '/core/',
            component: ComponentCreator('/core/', '00e'),
            routes: [
              {
                path: '/core/wallet-framework/',
                component: ComponentCreator('/core/wallet-framework/', '4e2'),
                exact: true,
                sidebar: "developersSidebar"
              },
              {
                path: '/core/wallet-framework/data-services/',
                component: ComponentCreator('/core/wallet-framework/data-services/', '8d3'),
                exact: true,
                sidebar: "developersSidebar"
              },
              {
                path: '/core/wallet-framework/data-services/best-practices/',
                component: ComponentCreator('/core/wallet-framework/data-services/best-practices/', 'dd4'),
                exact: true,
                sidebar: "developersSidebar"
              },
              {
                path: '/core/wallet-framework/data-services/introduction/',
                component: ComponentCreator('/core/wallet-framework/data-services/introduction/', 'c0c'),
                exact: true,
                sidebar: "developersSidebar"
              },
              {
                path: '/core/wallet-framework/data-services/using-data-services/',
                component: ComponentCreator('/core/wallet-framework/data-services/using-data-services/', '6d3'),
                exact: true,
                sidebar: "developersSidebar"
              },
              {
                path: '/core/wallet-framework/data-services/writing-data-services/',
                component: ComponentCreator('/core/wallet-framework/data-services/writing-data-services/', '363'),
                exact: true,
                sidebar: "developersSidebar"
              },
              {
                path: '/core/wallet-framework/data-services/writing-data-services/basics/',
                component: ComponentCreator('/core/wallet-framework/data-services/writing-data-services/basics/', '9e7'),
                exact: true,
                sidebar: "developersSidebar"
              },
              {
                path: '/core/wallet-framework/data-services/writing-data-services/mutations/',
                component: ComponentCreator('/core/wallet-framework/data-services/writing-data-services/mutations/', '85a'),
                exact: true,
                sidebar: "developersSidebar"
              },
              {
                path: '/core/wallet-framework/data-services/writing-data-services/other-features/',
                component: ComponentCreator('/core/wallet-framework/data-services/writing-data-services/other-features/', 'e60'),
                exact: true,
                sidebar: "developersSidebar"
              },
              {
                path: '/core/wallet-framework/data-services/writing-data-services/real-time-updates/',
                component: ComponentCreator('/core/wallet-framework/data-services/writing-data-services/real-time-updates/', 'b8d'),
                exact: true,
                sidebar: "developersSidebar"
              },
              {
                path: '/core/',
                component: ComponentCreator('/core/', '681'),
                exact: true,
                sidebar: "developersSidebar"
              }
            ]
          }
        ]
      }
    ]
  },
  {
    path: '*',
    component: ComponentCreator('*'),
  },
];

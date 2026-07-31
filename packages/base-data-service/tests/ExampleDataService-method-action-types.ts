/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { ExampleDataService } from './ExampleDataService.js';

export type ExampleDataServiceGetAssetsAction = {
  type: `ExampleDataService:getAssets`;
  handler: ExampleDataService['getAssets'];
};

export type ExampleDataServiceGetActivityAction = {
  type: `ExampleDataService:getActivity`;
  handler: ExampleDataService['getActivity'];
};

/**
 * Union of all ExampleDataService action types.
 */
export type ExampleDataServiceMethodActions =
  | ExampleDataServiceGetAssetsAction
  | ExampleDataServiceGetActivityAction;

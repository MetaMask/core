/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { ExampleDataService } from './ExampleDataService';

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

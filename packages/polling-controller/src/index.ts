import {
  StaticIntervalPollingControllerOnly,
  StaticIntervalPollingController,
  StaticIntervalPollingControllerV1,
} from './StaticIntervalPollingController';

export {
  BlockTrackerPollingControllerOnly,
  BlockTrackerPollingController,
  BlockTrackerPollingControllerV1,
} from './BlockTrackerPollingController';

const PollingControllerOnly = StaticIntervalPollingControllerOnly;
const PollingController = StaticIntervalPollingController;
const PollingControllerV1 = StaticIntervalPollingControllerV1;

export {
  StaticIntervalPollingControllerOnly,
  StaticIntervalPollingController,
  StaticIntervalPollingControllerV1,
  PollingControllerOnly,
  PollingController,
  PollingControllerV1,
};

export type { IPollingController } from './AbstractPollingController';

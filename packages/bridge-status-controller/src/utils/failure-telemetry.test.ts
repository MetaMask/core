import { FailurePhase, SwapBridgeErrorCode } from '@metamask/bridge-controller';

import {
  getHashPresenceProperties,
  getStatusFailurePhase,
  getStatusFailureTelemetry,
  getSubmitErrorCode,
  getSubmitFailureTelemetry,
} from './failure-telemetry.js';

describe('failure-telemetry', () => {
  describe('getSubmitErrorCode', () => {
    it('maps null to missing_error_object and Error to unknown', () => {
      expect(getSubmitErrorCode(null)).toBe(
        SwapBridgeErrorCode.MissingErrorObject,
      );
      expect(getSubmitErrorCode(new Error('snap failed'))).toBe(
        SwapBridgeErrorCode.Unknown,
      );
    });

    it('maps non-Error values to non_error_rejection', () => {
      expect(getSubmitErrorCode('rejected')).toBe(
        SwapBridgeErrorCode.NonErrorRejection,
      );
      expect(getSubmitErrorCode({ code: 4001 })).toBe(
        SwapBridgeErrorCode.NonErrorRejection,
      );
    });
  });

  describe('getHashPresenceProperties', () => {
    it('treats empty and missing hashes as absent', () => {
      expect(getHashPresenceProperties(undefined, null)).toStrictEqual({
        source_hash_present: false,
        destination_hash_present: false,
      });
      expect(getHashPresenceProperties('', '')).toStrictEqual({
        source_hash_present: false,
        destination_hash_present: false,
      });
    });

    it('flags hashes independently', () => {
      expect(getHashPresenceProperties('0xabc', undefined)).toStrictEqual({
        source_hash_present: true,
        destination_hash_present: false,
      });
      expect(getHashPresenceProperties('0xabc', '0xdef')).toStrictEqual({
        source_hash_present: true,
        destination_hash_present: true,
      });
    });
  });

  describe('getStatusFailurePhase', () => {
    it('prefers destination_execution, then source_execution, then poll', () => {
      expect(
        getStatusFailurePhase({
          source_hash_present: true,
          destination_hash_present: true,
        }),
      ).toBe(FailurePhase.DestinationExecution);
      expect(
        getStatusFailurePhase({
          source_hash_present: true,
          destination_hash_present: false,
        }),
      ).toBe(FailurePhase.SourceExecution);
      expect(
        getStatusFailurePhase({
          source_hash_present: false,
          destination_hash_present: false,
        }),
      ).toBe(FailurePhase.Poll);
    });
  });

  describe('getSubmitFailureTelemetry', () => {
    it('uses broadcast for submit failures with no hash', () => {
      expect(getSubmitFailureTelemetry(new Error('snap failed'))).toStrictEqual(
        {
          failure_phase: FailurePhase.Broadcast,
          error_code: SwapBridgeErrorCode.Unknown,
          source_hash_present: false,
          destination_hash_present: false,
        },
      );
      expect(getSubmitFailureTelemetry({ code: 4001 })).toStrictEqual({
        failure_phase: FailurePhase.Broadcast,
        error_code: SwapBridgeErrorCode.NonErrorRejection,
        source_hash_present: false,
        destination_hash_present: false,
      });
    });
  });

  describe('getStatusFailureTelemetry', () => {
    it('uses status_failed_without_reason and phase from hashes', () => {
      expect(getStatusFailureTelemetry('0xsrc', undefined)).toStrictEqual({
        failure_phase: FailurePhase.SourceExecution,
        error_code: SwapBridgeErrorCode.StatusFailedWithoutReason,
        source_hash_present: true,
        destination_hash_present: false,
      });
      expect(getStatusFailureTelemetry('0xsrc', '0xdest')).toStrictEqual({
        failure_phase: FailurePhase.DestinationExecution,
        error_code: SwapBridgeErrorCode.StatusFailedWithoutReason,
        source_hash_present: true,
        destination_hash_present: true,
      });
    });
  });
});

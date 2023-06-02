/**
 * An enum representing the allowed types of log messages supported by this
 * controller. When adding new types of special cased log types, make sure to
 * extend this enum with the new type name.
 */
export enum LogType {
  GenericLog = 'GenericLog',
  EthSignLog = 'EthSignLog',
}

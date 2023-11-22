## Log Types

This folder contains type definitions for the various special cased log types. So far this only includes the base generic type, as well as the EthSignLog type.

### Adding a special cased log type.

1. In src/logTypes/LogType.ts extend the enum LogType to include a new string for your proposed special log type.
2. Create new file in src/logTypes that matches the name of the type you added to the enum. Using the EthSignLog or GenericLog as an example, create your new log type and use the LogType enum for the type key.
3. Import your new type in the src/logTypes/index.ts and add it to the Log union type.
4. Re-export all types from your new file at the end of src/logTypes/index.ts file.

import type { InternalAccount, InternalAccountType } from '@metamask/keyring-api';
import { KeyringTypes } from '@metamask/keyring-controller';
export declare const createMockInternalAccount: ({ id, address, type, name, keyringType, snap, importTime, lastSelected, }?: {
    id?: string | undefined;
    address?: string | undefined;
    type?: InternalAccountType | undefined;
    name?: string | undefined;
    keyringType?: KeyringTypes | undefined;
    snap?: {
        id: string;
        enabled: boolean;
        name: string;
    } | undefined;
    importTime?: number | undefined;
    lastSelected?: number | undefined;
}) => InternalAccount;
//# sourceMappingURL=mocks.d.ts.map
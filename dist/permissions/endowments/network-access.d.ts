import { PermissionSpecificationBuilder, PermissionType } from '../Permission';
declare const permissionName = "endowment:network-access";
export declare const networkAccessEndowmentBuilder: Readonly<{
    readonly targetKey: "endowment:network-access";
    readonly specificationBuilder: PermissionSpecificationBuilder<PermissionType.Endowment, any, {
        permissionType: PermissionType.Endowment;
        targetKey: typeof permissionName;
        endowmentGetter: (_options?: any) => ['fetch', 'WebSocket'];
        allowedCaveats: null;
    }>;
}>;
export {};

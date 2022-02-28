export declare const endowmentPermissionBuilders: {
    readonly "endowment:network-access": Readonly<{
        readonly targetKey: "endowment:network-access";
        readonly specificationBuilder: import("..").PermissionSpecificationBuilder<import("..").PermissionType.Endowment, any, {
            permissionType: import("..").PermissionType.Endowment;
            targetKey: "endowment:network-access";
            endowmentGetter: (_options?: any) => ["fetch"];
            allowedCaveats: null;
        }>;
    }>;
};

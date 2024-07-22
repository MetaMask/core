import type { RestrictedControllerMessenger } from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { HandleSnapRequest } from '@metamask/snaps-controllers';
declare const controllerName = "AuthenticationController";
type SessionProfile = {
    identifierId: string;
    profileId: string;
};
type SessionData = {
    /** profile - anonymous profile data for the given logged in user */
    profile: SessionProfile;
    /** accessToken - used to make requests authorized endpoints */
    accessToken: string;
    /** expiresIn - string date to determine if new access token is required  */
    expiresIn: string;
};
type MetaMetricsAuth = {
    getMetaMetricsId: () => string | Promise<string>;
    agent: 'extension' | 'mobile';
};
export type AuthenticationControllerState = {
    /**
     * Global isSignedIn state.
     * Can be used to determine if "Profile Syncing" is enabled.
     */
    isSignedIn: boolean;
    sessionData?: SessionData;
};
export declare const defaultState: AuthenticationControllerState;
type CreateActionsObj<Controller extends keyof AuthenticationController> = {
    [K in Controller]: {
        type: `${typeof controllerName}:${K}`;
        handler: AuthenticationController[K];
    };
};
type ActionsObj = CreateActionsObj<'performSignIn' | 'performSignOut' | 'getBearerToken' | 'getSessionProfile' | 'isSignedIn'>;
export type Actions = ActionsObj[keyof ActionsObj];
export type AuthenticationControllerPerformSignIn = ActionsObj['performSignIn'];
export type AuthenticationControllerPerformSignOut = ActionsObj['performSignOut'];
export type AuthenticationControllerGetBearerToken = ActionsObj['getBearerToken'];
export type AuthenticationControllerGetSessionProfile = ActionsObj['getSessionProfile'];
export type AuthenticationControllerIsSignedIn = ActionsObj['isSignedIn'];
export type AllowedActions = HandleSnapRequest;
export type AuthenticationControllerMessenger = RestrictedControllerMessenger<typeof controllerName, Actions | AllowedActions, never, AllowedActions['type'], never>;
/**
 * Controller that enables authentication for restricted endpoints.
 * Used for Global Profile Syncing and Notifications
 */
export default class AuthenticationController extends BaseController<typeof controllerName, AuthenticationControllerState, AuthenticationControllerMessenger> {
    #private;
    constructor({ messenger, state, metametrics, }: {
        messenger: AuthenticationControllerMessenger;
        state?: AuthenticationControllerState;
        /**
         * Not using the Messaging System as we
         * do not want to tie this strictly to extension
         */
        metametrics: MetaMetricsAuth;
    });
    performSignIn(): Promise<string>;
    performSignOut(): void;
    getBearerToken(): Promise<string>;
    /**
     * Will return a session profile.
     * Throws if a user is not logged in.
     *
     * @returns profile for the session.
     */
    getSessionProfile(): Promise<SessionProfile>;
    isSignedIn(): boolean;
}
export {};
//# sourceMappingURL=AuthenticationController.d.ts.map
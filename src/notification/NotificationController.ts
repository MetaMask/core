import BaseController, { BaseConfig, BaseState } from "../BaseController";

type viewedNotification = {[id:number]: boolean};

export interface Notification{
    id: number;
	title: string;
	description: string;
    date: string;
	image?: string;
    actionText: string;
    isShown?: Boolean;
}

//NotitificationConfig will hold the notifications from JSON file read from `metamask-extension`
export interface NotificationConfig extends BaseConfig{
    notificationsFromFile: { [whatsnew: string]: Notification[]};
}

//Notification state will hold all the seen and unseen notifications 
// that are still active
export interface NotificationState extends BaseState{
    notifications: Notification[]
}

const defaultState = { notifications: [] }

/**
 * Controller for managing the notifications for new features introducesd into the applications 
 */
export class NotificationController extends BaseController<NotificationConfig, NotificationState>{

    constructor(config: NotificationConfig, state?: NotificationState){
        const { notificationsFromFile } = config;
        super(config, state || defaultState);
        this.initialize();
        this.addNotifications(notificationsFromFile.whatsnew)
    }

    /**
     * Compares the notifications in teh states with the notifications from the files to check if there is any new notitifcations/announcements
     * if yes, the new notification will be added to the state with a flag indicating that the notification is not seen by the user.
     * @param filedNotifications 
     */
    private addNotifications(filedNotifications: Notification[]): void{
        let stateNotifications = this.state.notifications;
        let exists: boolean;
        if(this.state.notifications.length > 0){
            for(let fromFile of filedNotifications){
                exists = false;
                for(let fromState of this.state.notifications){
                    if(fromFile.id == fromState.id){
                        exists = true;
                        break;
                    }
                }
                if(!exists){
                    fromFile.isShown = false;
                    stateNotifications.push(fromFile);
                }
            }
       }else{
            for(let fromfile of filedNotifications){
                fromfile.isShown = false;
                stateNotifications.push(fromfile);
            }
        }
        this.update({ notifications: stateNotifications }, true)
    }

    /**
     * Updates the status of the status of the specified notifications once it is read by the user.
     * @param viewedIds 
     */
    updateViewed(viewedIds: viewedNotification):void {
        const stateNotifications = this.state.notifications
        for(let index=0; index< stateNotifications.length; index++){
            stateNotifications[index].isShown = viewedIds[stateNotifications[index].id]
        }
        this.update({ notifications: stateNotifications }, true);
    }
}
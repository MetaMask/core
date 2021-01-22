import { NotificationConfig, NotificationController, NotificationState } from '../dist/notification/NotificationController';

const config1: NotificationConfig = {
    notificationsFromFile:{
        whatsnew:[
            {
                id: 1,
                title: 'Now Swao tokens dirsctly in your wallet!',
                description: 'MetaMask now aggregates multiple decentralized exchange aggregators to ensure you always get the best swap price with the lowest netwrok fees.',
                date: '12/8/2020',
                actionText: 'url'
            },
            {
                id: 2,
                title: 'MetaMask Mobile is here!',
                description: 'Sync with your extension wallet in seconds. Scan the QR code with your mobile camera to download the app.',
                date: '12/8/2020',
                actionText: 'url',
            }
        ]
    }
}
const config2: NotificationConfig = {
    notificationsFromFile:{
        whatsnew:[
            {
                id: 1,
                title: 'Now Swao tokens dirsctly in your wallet!',
                description: 'MetaMask now aggregates multiple decentralized exchange aggregators to ensure you always get the best swap price with the lowest netwrok fees.',
                date: '12/8/2020',
                actionText: 'url'
            },
            {
                id: 2,
                title: 'MetaMask Mobile is here!',
                description: 'Sync with your extension wallet in seconds. Scan the QR code with your mobile camera to download the app.',
                date: '12/8/2020',
                actionText: 'url',
            },
            {
                id: 3,
                title: 'NSS Survey',
                description: 'Take NSS survey here',
                date: '12/8/2020',
                actionText: 'url',
            }
        ]
    }
}

describe('notification controller', ()=>{
    let state: NotificationState;
    it('should add notifications to state',()=>{
        const controller = new NotificationController(config1)
        expect(controller.state.notifications).toHaveLength(2);
        state = controller.state;
    })
    let controller : NotificationController;
    it('should add new notifcation to state',()=>{
        controller = new NotificationController(config2, state)
        expect(controller.state.notifications).toHaveLength(3);
    })
    describe('update viewed notifications', ()=>{
        it('should update isshown status',()=>{
            controller.updateViewed({1: true});
            expect(controller.state.notifications[0].isShown).toBeTruthy();
            expect(controller.state.notifications[1].isShown).toBeFalsy()
        })
        it('should update isshown of more than one notifications',()=>{
            controller.updateViewed({2: true, 3:true});
            expect(controller.state.notifications[1].isShown).toBeTruthy();
            expect(controller.state.notifications[2].isShown).toBeTruthy()
            state = controller.state;
        })
    })
    describe('remove outdated notifications', ()=>{
        it('should remove outdated notifications from state',()=>{
            controller = new NotificationController(config1, state)
            expect(controller.state.notifications).toHaveLength(2);
        })
    })
})
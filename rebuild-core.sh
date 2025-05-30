#!/bin/bash -x

yarn build
#rsync -av --delete packages/keyring-controller/dist/ ~/code/metamask-mobile/node_modules/@metamask/keyring-controller/dist
rsync -av --delete packages/accounts-controller/dist/ ~/code/metamask-mobile/node_modules/@metamask/accounts-controller/dist
#rsync -av --delete packages/base-controller/dist/ ~/code/metamask-mobile/node_modules/@metamask/base-controller/dist
#rsync -av --delete packages/controller-utils/dist/ ~/code/metamask-mobile/node_modules/@metamask/controller-utils/dist

//
// Copyright (c) Microsoft. All rights reserved.
// Licensed under the MIT license.
//
// Microsoft Bot Framework: http://botframework.com
//
// Bot Framework Emulator Github:
// https://github.com/Microsoft/BotFramwork-Emulator
//
// Copyright (c) Microsoft Corporation
// All rights reserved.
//
// MIT License:
// Permission is hereby granted, free of charge, to any person obtaining
// a copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to
// permit persons to whom the Software is furnished to do so, subject to
// the following conditions:
//
// The above copyright notice and this permission notice shall be
// included in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED ""AS IS"", WITHOUT WARRANTY OF ANY KIND,
// EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
// NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
// LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
// OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
// WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
//
import { SharedConstants } from '@bfemulator/app-shared';
import { LuisService } from 'botframework-config/lib/models';
import { mount } from 'enzyme';
import * as React from 'react';
import { Provider } from 'react-redux';
import { combineReducers, createStore, applyMiddleware } from 'redux';
import sagaMiddlewareFactory from 'redux-saga';

import { load, setActive } from '../../../../state/actions/botActions';
import {
  openAddServiceContextMenu,
  openContextMenuForConnectedService,
  openServiceDeepLink,
  openSortContextMenu,
  OPEN_ADD_CONNECTED_SERVICE_CONTEXT_MENU,
  OPEN_CONTEXT_MENU_FOR_CONNECTED_SERVICE,
} from '../../../../state/actions/connectedServiceActions';
import { bot } from '../../../../state/reducers/bot';
import { explorer } from '../../../../state/reducers/explorer';
import {
  AzureLoginFailedDialogContainer,
  AzureLoginSuccessDialogContainer,
  ConnectServicePromptDialogContainer,
  GetStartedWithCSDialogContainer,
  ProgressIndicatorContainer,
} from '../../../dialogs';
import { executeCommand, CommandAction, CommandActionPayload } from '../../../../state/actions/commandActions';
import { ServicesExplorerSagas, servicesExplorerSagas } from '../../../../state/sagas/servicesExplorerSagas';

import { ConnectedServiceEditorContainer } from './connectedServiceEditor';
import { ConnectedServicePickerContainer } from './connectedServicePicker/connectedServicePickerContainer';
import { ServicesExplorer } from './servicesExplorer';
import { ServicesExplorerContainer } from './servicesExplorerContainer';

jest.mock('./servicesExplorer.scss', () => ({}));
jest.mock('../servicePane/servicePane.scss', () => ({}));
jest.mock('./connectedServicePicker/connectedServicePicker.scss', () => ({}));
jest.mock('./connectedServiceEditor/connectedServiceEditor.scss', () => ({}));
jest.mock('./servicesExplorer.scss', () => ({}));

describe('The ServicesExplorer component', () => {
  const sagaMiddleware = sagaMiddlewareFactory();
  let parent;
  let node;
  let mockStore;
  let mockBot;
  let mockDispatch;
  let instance;

  beforeEach(() => {
    mockStore = createStore(combineReducers({ bot, explorer }), {}, applyMiddleware(sagaMiddleware));
    sagaMiddleware.run(servicesExplorerSagas);
    mockBot = JSON.parse(`{
        "name": "TestBot",
        "description": "",
        "padlock": "",
        "services": [{
            "type": "luis",
            "name": "https://testbot.botframework.com/api/messagesv3",
            "id": "https://testbot.botframework.com/api/messagesv3",
            "appId": "51fc2648-1190-44fa-9559-87b11b1d0014",
            "appPassword": "jxZjGcOpyfM4q75vp2paNQd",
            "endpoint": "https://testbot.botframework.com/api/messagesv3"
        }]
      }`);
    mockBot.services[0] = new LuisService(mockBot.services[0]);
    mockStore.dispatch(load([mockBot]));
    mockStore.dispatch(setActive(mockBot));
    const originalDispatch = mockStore.dispatch.bind(mockStore);
    mockDispatch = jest
      .spyOn(mockStore, 'dispatch')
      .mockImplementation((action: CommandAction<CommandActionPayload>) => {
        if (action.type === OPEN_ADD_CONNECTED_SERVICE_CONTEXT_MENU) {
          action.payload.resolver();

          return action;
        }

        return originalDispatch(action);
      });
    parent = mount(
      <Provider store={mockStore}>
        <ServicesExplorerContainer />
      </Provider>
    );
    node = parent.find(ServicesExplorer);
    instance = node.instance();
  });

  it('should render deeply', () => {
    expect(parent.find(ServicesExplorerContainer)).not.toBe(null);
    expect(parent.find(ServicesExplorer)).not.toBe(null);
  });

  it('should dispatch a request to open a luis deep link when a service is clicked', () => {
    instance.onLinkClick({ currentTarget: { dataset: { index: 0 } } });
    expect(mockDispatch).toHaveBeenCalledWith(openServiceDeepLink(mockBot.services[0]));
  });

  it('should dispatch a request to open the context menu when right clicking on a luis service', () => {
    const mockLi = document.createElement('li');
    mockLi.setAttribute('data-index', '0');

    instance.onContextMenuOverLiElement(mockLi);
    expect(mockDispatch).toHaveBeenCalledWith(
      openContextMenuForConnectedService(ConnectedServiceEditorContainer, mockBot.services[0])
    );
  });

  it('should dispatch a request to open the connected service picker when the add icon is clicked', async () => {
    const mockOnAddIconClick = {
      focus: jest.fn(() => {
        return null;
      }),
    };

    instance.addIconButtonRef = mockOnAddIconClick;

    await instance.onAddIconClick();

    expect(mockDispatch).toHaveBeenCalledWith(
      openAddServiceContextMenu(
        {
          azureAuthWorkflowComponents: {
            loginFailedDialog: AzureLoginFailedDialogContainer,
            loginSuccessDialog: AzureLoginSuccessDialogContainer,
            promptDialog: ConnectServicePromptDialogContainer,
          },
          getStartedDialog: GetStartedWithCSDialogContainer,
          editorComponent: ConnectedServiceEditorContainer,
          pickerComponent: ConnectedServicePickerContainer,
          progressIndicatorComponent: ProgressIndicatorContainer,
        },
        jasmine.any(Function) as any
      )
    );

    expect(mockOnAddIconClick.focus).toHaveBeenCalled();
  });

  it('should dispatch to the store when a request to open the sort context menu is made', () => {
    const instance = node.instance();
    instance.onSortClick();
    expect(mockDispatch).toHaveBeenCalledWith(openSortContextMenu());
  });

  it('should open the service deep link when the enter key is pressed on a focused list item', () => {
    const instance = node.instance();
    const onLinkClickSpy = jest.spyOn(instance, 'onLinkClick');
    instance.onKeyPress({
      key: 'Enter',
      currentTarget: { dataset: { index: 0 } },
    });
    expect(onLinkClickSpy).toHaveBeenCalledWith({
      key: 'Enter',
      currentTarget: { dataset: { index: 0 } },
    });
  });

  it('should flag newly added services for animation', () => {
    const instance = node.instance();
    const c = Object.getPrototypeOf(instance).constructor;
    const prevState = {
      sortCriteria: 'name',
      services: [{ id: 'existingService' }],
    };

    const nextProps = {
      sortCriteria: 'name',
      services: [{ id: 'existingService' }, { id: 'newService' }],
    };

    const state = c.getDerivedStateFromProps(nextProps, prevState);
    expect(state.toAnimate.newService).toBe(true);
    expect(state.toAnimate.existingService).toBeUndefined();
  });

  it('should call the appropriate command when onAnchorClick is called', () => {
    const instance = node.instance();
    instance.props.onAnchorClick('http://blah');
    expect(mockDispatch).toHaveBeenCalledWith(
      executeCommand(true, SharedConstants.Commands.Electron.OpenExternal, null, 'http://blah')
    );
  });
});

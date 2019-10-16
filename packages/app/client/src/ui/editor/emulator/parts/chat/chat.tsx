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

import { ValueTypes } from '@bfemulator/app-shared';
import { User } from '@bfemulator/sdk-shared';
import { Activity, ActivityTypes } from 'botframework-schema';
import ReactWebChat, { createStyleSet } from 'botframework-webchat';
import * as React from 'react';
import { PureComponent, KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { PrimaryButton } from '@bfemulator/ui-react';
import { EmulatorMode } from '@bfemulator/sdk-shared';
import { DirectLine } from 'botframework-directlinejs';

import { areActivitiesEqual, getActivityTargets } from '../../../../../utils';

import ActivityWrapper from './activityWrapper';
import * as styles from './chat.scss';
import webChatStyleOptions from './webChatTheme';

export interface ChatProps {
  botId?: string;
  conversationId?: string;
  directLine?: DirectLine;
  documentId?: string;
  inspectorObjects?: any[];
  highlightedObjects?: Activity[];
  mode: EmulatorMode;
  currentUser: User;
  locale: string;
  webSpeechPonyfillFactory?: () => any;
  pendingSpeechTokenRetrieval?: boolean;
  showContextMenuForActivity: (activity: Partial<Activity>) => void;
  setInspectorObject: (documentId: string, activity: Partial<Activity & { showInInspector: true }>) => void;
  webchatStore: any;
  showOpenUrlDialog?: (url) => any;
}

interface ChatState {
  highlightedActivities?: Activity[];
}

const adaptiveCardInputs = {
  INPUT: null,
  OPTION: null,
  SELECT: null,
  TEXTAREA: null,
};

export class Chat extends PureComponent<ChatProps, ChatState> {
  public state = { waitForSpeechToken: false } as ChatState;
  private activityMap: { [activityId: string]: Activity };

  public static getDerivedStateFromProps(newProps: ChatProps): ChatState {
    let selectedActivity = 'inspectorObjects' in newProps ? newProps.inspectorObjects[0] : ({} as Activity);
    // The log panel gives us the entire trace while
    // WebChat gives us the nested activity. Determine
    // if we should be targeting the nested activity
    // within the selected activity.
    if (selectedActivity && selectedActivity.valueType === ValueTypes.Activity) {
      selectedActivity = selectedActivity.value;
    }
    const highlightedActivities = getActivityTargets([...(newProps.highlightedObjects || []), selectedActivity]);
    return {
      highlightedActivities,
    };
  }

  public render() {
    this.activityMap = {};
    const {
      botId,
      currentUser,
      conversationId,
      directLine,
      locale,
      mode,
      webchatStore,
      webSpeechPonyfillFactory,
    } = this.props;

    const isDisabled = mode === 'transcript' || mode === 'debug';

    // Due to needing to make idiosyncratic style changes, Emulator is using `createStyleSet` instead of `createStyleOptions`. The object below: {...webChatStyleOptions, hideSendBox...} was formerly passed into the `styleOptions` parameter of React Web Chat. If further styling modifications are desired using styleOptions, simply pass it into the same object in createStyleSet below.

    const styleSet = createStyleSet({ ...webChatStyleOptions, hideSendBox: isDisabled });

    styleSet.uploadButton = {
      ...styleSet.uploadButton,
      padding: '1px',
    };

    if (this.props.pendingSpeechTokenRetrieval) {
      return <div className={styles.disconnected}>Connecting...</div>;
    }

    if (directLine) {
      const bot = {
        id: botId || 'bot',
        name: 'Bot',
      };

      return (
        <div className={styles.chat}>
          <ReactWebChat
            store={webchatStore}
            activityMiddleware={this.createActivityMiddleware}
            cardActionMiddleware={this.cardActionMiddleware}
            bot={bot}
            directLine={directLine}
            disabled={isDisabled}
            key={conversationId}
            locale={locale}
            styleSet={styleSet}
            userID={currentUser.id}
            username={currentUser.name || 'User'}
            webSpeechPonyfillFactory={webSpeechPonyfillFactory}
          />
        </div>
      );
    }

    return <div className={styles.disconnected}>Not Connected</div>;
  }

  private activityWrapper(next, card, children): ReactNode {
    return (
      <ActivityWrapper
        activity={card.activity}
        data-activity-id={card.activity.id}
        onClick={this.onItemRendererClick}
        onKeyDown={this.onItemRendererKeyDown}
        onContextMenu={this.onContextMenu}
        isSelected={this.shouldBeSelected(card.activity)}
      >
        {next(card)(children)}
      </ActivityWrapper>
    );
  }

  private cardActionMiddleware = () => next => async ({ cardAction, getSignInUrl }) => {
    const { type, value } = cardAction;

    switch (type) {
      case 'signin': {
        const popup = window.open();
        const url = await getSignInUrl();
        popup.location.href = url;
        break;
      }
      case 'downloadFile':
      case 'playAudio':
      case 'playVideo':
      case 'showImage':
      case 'openUrl':
        if (value) {
          this.props.showOpenUrlDialog(value).then(result => {
            if (result == 1) {
              window.open(value, '_blank');
            }
          });
        }
        break;

      default:
        return next({ cardAction, getSignInUrl });
    }
  };

  private createActivityMiddleware = () => next => card => children => {
    const { valueType } = card.activity;

    this.activityMap[card.activity.id] = valueType === ValueTypes.Activity ? card.activity.value : card.activity;

    switch (card.activity.type) {
      case ActivityTypes.Trace:
        return this.renderTraceActivity(next, card, children);

      case ActivityTypes.EndOfConversation:
        return null;

      default:
        return this.activityWrapper(next, card, children);
    }
  };

  private renderTraceActivity(next, card, children): ReactNode {
    if (this.props.mode !== 'debug') {
      return null;
    }
    const { valueType } = card.activity; // activities are nested
    if (valueType === ValueTypes.Activity) {
      const messageActivity = card.activity.value;
      return (
        <ActivityWrapper
          activity={messageActivity}
          data-activity-id={card.activity.id}
          onKeyDown={this.onItemRendererKeyDown}
          onClick={this.onItemRendererClick}
          onContextMenu={this.onContextMenu}
          isSelected={this.shouldBeSelected(messageActivity)}
        >
          {next({ activity: messageActivity, timestampClassName: 'transcript-timestamp' })(children)}
        </ActivityWrapper>
      );
    } else if (valueType === ValueTypes.Command) {
      const messageActivity = { ...card.activity, type: ActivityTypes.Message, text: card.activity.value } as Activity;
      return (
        <ActivityWrapper
          activity={messageActivity}
          data-activity-id={card.activity.id}
          onKeyDown={this.onItemRendererKeyDown}
          onClick={this.onItemRendererClick}
          onContextMenu={this.onContextMenu}
          isSelected={this.shouldBeSelected(messageActivity)}
        >
          {next({ activity: messageActivity, timestampClassName: 'transcript-timestamp' })(children)}
        </ActivityWrapper>
      );
    } else if (valueType === ValueTypes.BotState) {
      const diffIndicatorIndex =
        this.state.highlightedActivities.length > 1
          ? this.state.highlightedActivities.findIndex(activity => areActivitiesEqual(activity, card.activity))
          : -1;
      return (
        <PrimaryButton
          className={styles.botStateObject}
          data-activity-id={card.activity.id}
          data-diff-indicator-index={diffIndicatorIndex}
          onKeyDown={this.onItemRendererKeyDown}
          onClick={this.onItemRendererClick}
          onContextMenu={this.onContextMenu}
          aria-selected={this.shouldBeSelected(card.activity)}
        >
          Bot State
        </PrimaryButton>
      );
    }
    return null;
  }

  protected updateSelectedActivity(id: string): void {
    const selectedActivity: Activity & { showInInspector?: boolean } = this.activityMap[id];
    this.props.setInspectorObject(this.props.documentId, { ...selectedActivity, showInInspector: true });
  }

  private shouldBeSelected(subject: Activity): boolean {
    return this.state.highlightedActivities.some(activity => areActivitiesEqual(activity, subject));
  }

  private onItemRendererClick = (event: MouseEvent<HTMLDivElement | HTMLButtonElement>): void => {
    // if we click inside of an input within an adaptive card, we want to avoid selecting the activity
    // because it will cause a Web Chat re-render which will wipe the adaptive card state
    const { target = { tagName: '' } } = event;
    if (this.elementIsAnAdaptiveCardInput(target as HTMLElement)) {
      return;
    }
    const { activityId } = (event.currentTarget as any).dataset;
    this.updateSelectedActivity(activityId);
  };

  private onItemRendererKeyDown = (event: KeyboardEvent<HTMLDivElement | HTMLButtonElement>): void => {
    if (event.key !== ' ' && event.key !== 'Enter') {
      return;
    }
    // if we type inside of an input within an adaptive card, we want to avoid selecting the activity
    // on spacebar because it will cause a Web Chat re-render which will wipe the adaptive card state
    const { target = { tagName: '' } } = event;
    if (event.key === ' ' && this.elementIsAnAdaptiveCardInput(target as HTMLElement)) {
      return;
    }
    const { activityId } = (event.currentTarget as any).dataset;
    this.updateSelectedActivity(activityId);
  };

  private onContextMenu = (event: MouseEvent<HTMLDivElement | HTMLButtonElement>): void => {
    const { activityId } = (event.currentTarget as any).dataset;
    const activity = this.activityMap[activityId];

    this.updateSelectedActivity(activityId);
    this.props.showContextMenuForActivity(activity);
  };

  private elementIsAnAdaptiveCardInput = (element: HTMLElement): boolean => {
    const { tagName = '' } = element;
    // adaptive cards embed <p> tags inside of input <labels>
    if (element.parentElement && element.parentElement.tagName === 'LABEL') {
      return true;
    }
    return tagName in adaptiveCardInputs;
  };
}

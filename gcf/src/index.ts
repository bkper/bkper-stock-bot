import 'source-map-support/register.js'
import { HttpFunction } from '@google-cloud/functions-framework/build/src/functions';
import { Bkper } from 'bkper-js';
import { getOAuthToken } from 'bkper';
import { Request, Response } from 'express';
import express from 'express';
import httpContext from 'express-http-context';

import { EventHandlerTransactionPosted } from './EventHandlerTransactionPosted.js';
import { EventHandlerTransactionChecked } from './EventHandlerTransactionChecked.js';
import { EventHandlerTransactionUnchecked } from './EventHandlerTransactionUnchecked.js';
import { EventHandlerTransactionUpdated } from './EventHandlerTransactionUpdated.js';
import { EventHandlerTransactionDeleted } from './EventHandlerTransactionDeleted.js';
import { EventHandlerTransactionRestored } from './EventHandlerTransactionRestored.js';
import { EventHandlerAccountCreatedOrUpdated } from './EventHandlerAccountCreatedOrUpdated.js';
import { EventHandlerAccountDeleted } from './EventHandlerAccountDeleted.js';
import { EventHandlerGroupCreatedOrUpdated } from './EventHandlerGroupCreatedOrUpdated.js';
import { EventHandlerBookUpdated } from './EventHandlerBookUpdated.js';

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url); // get the resolved path to the file
const __dirname = path.dirname(__filename); // get the name of the directory

dotenv.config({ path: `${__dirname}/../../.env` });

const app = express();
app.use(httpContext.middleware);
app.use('/', handleEvent);
export const doPost: HttpFunction = app;

export type Result = {
  result?: string[] | string | boolean,
  error?: string,
  warning?: string
}

function init(req: Request, res: Response) {
  res.setHeader('Content-Type', 'application/json');

  //Put OAuth token from header in the http context for later use when calling the API. https://julio.li/b/2016/10/29/request-persistence-express/
  const oauthTokenHeader = 'bkper-oauth-token';
  httpContext.set(oauthTokenHeader, req.headers[oauthTokenHeader]);

  Bkper.setConfig({
    oauthTokenProvider: process.env.NODE_ENV === 'development' ? async () => import('bkper').then(bkper => bkper.getOAuthToken()) : async () => httpContext.get(oauthTokenHeader),
    apiKeyProvider: async () => process.env.BKPER_API_KEY || req.headers['bkper-api-key'] as string
  })
}

async function handleEvent(req: Request, res: Response) {

  init(req, res);

  try {

    let event: bkper.Event = req.body
    let result: Result = { result: false };


    switch (event.type) {

      case 'TRANSACTION_POSTED':
        result = await new EventHandlerTransactionPosted().handleEvent(event);
        break;
      case 'TRANSACTION_CHECKED':
        result = await new EventHandlerTransactionChecked().handleEvent(event);
        break;
      case 'TRANSACTION_UNCHECKED':
        result = await new EventHandlerTransactionUnchecked().handleEvent(event);
        break;
      case 'TRANSACTION_UPDATED':
        result = await new EventHandlerTransactionUpdated().handleEvent(event);
        break;
      case 'TRANSACTION_DELETED':
        result = await new EventHandlerTransactionDeleted().handleEvent(event);
        break;
      case 'TRANSACTION_RESTORED':
        result = await new EventHandlerTransactionRestored().handleEvent(event);
        break;
      case 'ACCOUNT_CREATED':
        result = await new EventHandlerAccountCreatedOrUpdated().handleEvent(event);
        break;
      case 'ACCOUNT_UPDATED':
        result = await new EventHandlerAccountCreatedOrUpdated().handleEvent(event);
        break;
      case 'ACCOUNT_DELETED':
        result = await new EventHandlerAccountDeleted().handleEvent(event);
        break;
      case 'GROUP_CREATED':
        result = await new EventHandlerGroupCreatedOrUpdated().handleEvent(event);
        break;
      case 'GROUP_UPDATED':
        result = await new EventHandlerGroupCreatedOrUpdated().handleEvent(event);
        break;
      case 'GROUP_DELETED':
        result = await new EventHandlerGroupCreatedOrUpdated().handleEvent(event);
        break;
      case 'BOOK_UPDATED':
        result = await new EventHandlerBookUpdated().handleEvent(event);
        break;

    }

    res.send(response(result))

  } catch (err: any) {
    console.error(err);
    res.send(response({ error: err.stack ? err.stack.split("\n") : err }))
  }

}

function response(result: Result): string {
  const body = JSON.stringify(result, null, 4);
  return body;
}



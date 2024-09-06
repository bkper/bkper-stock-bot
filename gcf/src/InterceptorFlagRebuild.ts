import { Book } from "bkper-js";
import { Result } from "./index.js";
import { getStockAccount, isStockBook } from "./BotService.js";
import { NEEDS_REBUILD_PROP } from "./constants.js";

export class InterceptorFlagRebuild {

  async intercept(baseBook: Book, event: bkper.Event): Promise<Result> {
    if (isStockBook(baseBook) && event.agent.id != 'stock-bot') {
      let operation = event.data.object as bkper.TransactionOperation;
      let transactionPayload = operation.transaction;
      let transaction = await baseBook.getTransaction(transactionPayload.id);
      
      let stockAccount = await getStockAccount(transaction);

      if(stockAccount && stockAccount.getProperty(NEEDS_REBUILD_PROP) == null) {
        stockAccount.setProperty(NEEDS_REBUILD_PROP, 'TRUE').update();
          const msg = `Flagging account ${stockAccount.getName()} for rebuild`;
        return {warning: msg, result: msg};
      }
    }
    return {result: false};
  }

}
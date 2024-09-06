import { Bkper } from "bkper-js";
import { Result } from "./index.js";
import { InterceptorFlagRebuild } from "./InterceptorFlagRebuild.js";

export class EventHandlerTransactionUnchecked {

  async handleEvent(event: bkper.Event): Promise<Result> {
    let baseBook = await Bkper.getBook(event.bookId);
    const response = await  new InterceptorFlagRebuild().intercept(baseBook, event);
    if (response) {
      return response;
    }
    return {result: false};
  }

}
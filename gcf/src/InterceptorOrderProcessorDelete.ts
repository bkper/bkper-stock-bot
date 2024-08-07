import { Book, Transaction } from "bkper";
import { flagStockAccountForRebuildIfNeeded, getStockBook, getBaseBook, isHistorical } from "./BotService";

export abstract class InterceptorOrderProcessorDelete {

  protected cascadeDelete(book: Book, transaction: bkper.Transaction) {
    if (!book) {
      return;
    }
    // Fair
    this.cascadeDeleteTransactions(book, transaction, ``);
    this.cascadeDeleteTransactions(book, transaction, `mtm_`);
    this.cascadeDeleteTransactions(getBaseBook(book), transaction, `fx_`);
    // Hist
    const stockBook = getStockBook(book);
    if (!isHistorical(stockBook)) {
      this.cascadeDeleteTransactions(book, transaction, `hist_`);
      this.cascadeDeleteTransactions(book, transaction, `mtm_hist_`);
      this.cascadeDeleteTransactions(getBaseBook(book), transaction, `fx_hist_`);
    }
  }

  protected async cascadeDeleteTransactions(book: Book, remoteTx: bkper.Transaction, prefix: string) {
    let iterator = book.getTransactions(`remoteId:${prefix}${remoteTx.id}`);
    if (await iterator.hasNext()) {
      let tx = await iterator.next();
      if (tx.isChecked()) {
        tx = await tx.uncheck();
      }
      await tx.remove();
    }
  }

  protected async buildDeleteResponse(tx: Transaction): Promise<string> {
    return `DELETED: ${tx.getDateFormatted()} ${tx.getAmount()} ${await tx.getCreditAccountName()} ${await tx.getDebitAccountName()} ${tx.getDescription()}`
  }

  protected async deleteTransaction(book: Book, remoteId: string): Promise<Transaction> {
    let iterator = book.getTransactions(`remoteId:${remoteId}`);
    if (await iterator.hasNext()) {
      let tx = await iterator.next();
      if (tx.isChecked()) {
        tx = await tx.uncheck();
      }
      tx = await tx.remove();
      return tx;
    }
    return null;
  }


  protected async deleteOnStockBook(financialBook: Book, remoteId: string): Promise<Transaction> {
    let stockBook = getStockBook(financialBook);
    const deletedStockTx = await this.deleteTransaction(stockBook, remoteId);
    if (deletedStockTx) {
      await flagStockAccountForRebuildIfNeeded(deletedStockTx);
      this.cascadeDelete(financialBook, deletedStockTx.json());
    }
    return deletedStockTx;
  }
}
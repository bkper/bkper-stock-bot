namespace BotService {

  export function auditBooks(bookId: string): void {
    let book = BkperApp.getBook(bookId);
    let connectedBooks = book.getCollection().getBooks();
    connectedBooks.forEach(b => {
      b.audit();
    });
  }

  export function calculateFxGain(purchaseAmount: Bkper.Amount, purchaseRate: Bkper.Amount, saleAmount: Bkper.Amount, saleRate: Bkper.Amount, shortSale: boolean): Bkper.Amount {
    if (!purchaseRate || !saleRate) {
      return undefined;
    }
    const purchaseConvertedAmountAtInitialRate = purchaseAmount.times(purchaseRate);
    const saleConvertedAmoutAtInitialRate = saleAmount.times(purchaseRate);
    const gainFxAtPurchaseRate = saleConvertedAmoutAtInitialRate.minus(purchaseConvertedAmountAtInitialRate);
    const saleConvertedAmountAtFinalRate = saleAmount.times(saleRate);
    const gainFxAtSaleRate = saleConvertedAmountAtFinalRate.minus(purchaseConvertedAmountAtInitialRate)
    return shortSale ? gainFxAtPurchaseRate.minus(gainFxAtSaleRate) : gainFxAtSaleRate.minus(gainFxAtPurchaseRate)
  }

  export function getExcRate(baseBook: Bkper.Book, financialBook: Bkper.Book, stockTransaction: Bkper.Transaction, excRateProp: string): Bkper.Amount {
    if (baseBook.getProperty(EXC_CODE_PROP) == financialBook.getProperty(EXC_CODE_PROP)) {
      return undefined;
    }
    if (!stockTransaction.getRemoteIds()) {
      return undefined;
    }

    //Already set
    if (stockTransaction.getProperty(excRateProp)) {
      return BkperApp.newAmount(stockTransaction.getProperty(excRateProp))
    }

    for (const remoteId of stockTransaction.getRemoteIds()) {
      const financialTransaction = financialBook.getTransaction(remoteId);
      const baseIterator = baseBook.getTransactions(`remoteId:${financialTransaction.getId()}`);
      while (baseIterator.hasNext()) {
        const baseTransaction = baseIterator.next();
        if (baseTransaction.getProperty(EXC_RATE_PROP, 'exc_base_rate')) {
          return BkperApp.newAmount(baseTransaction.getProperty(EXC_RATE_PROP, 'exc_base_rate'));
        }
      }
    }

    return undefined;
  }

  export function getBaseBook(book: Bkper.Book): Bkper.Book {
    if (book.getCollection() == null) {
      return null;
    }
    let connectedBooks = book.getCollection().getBooks();
    for (const connectedBook of connectedBooks) {
      if (connectedBook.getProperty(EXC_BASE_PROP)) {
        return connectedBook;
      }
    }
    for (const connectedBook of connectedBooks) {
      if (connectedBook.getProperty(EXC_CODE_PROP) == 'USD') {
        return connectedBook;
      }
    }
    return null;
  }


  export function getStockBook(book: Bkper.Book): Bkper.Book {
    if (book.getCollection() == null) {
      return null;
    }
    let connectedBooks = book.getCollection().getBooks();
    for (const connectedBook of connectedBooks) {
      if (connectedBook.getProperty(STOCK_BOOK_PROP)) {
        return connectedBook;
      }
      let fractionDigits = connectedBook.getFractionDigits();
      if (fractionDigits == 0) {
        return connectedBook;
      }
    }
    return null;
  }

  export function getFinancialBook(book: Bkper.Book, excCode?: string): Bkper.Book {
    if (book.getCollection() == null) {
      return null;
    }
    let connectedBooks = book.getCollection().getBooks();
    for (const connectedBook of connectedBooks) {
      let excCodeConnectedBook = getExcCode(connectedBook);
      let fractionDigits = connectedBook.getFractionDigits();
      if (fractionDigits != 0 && excCode == excCodeConnectedBook) {
        return connectedBook;
      }
    }
    return null;
  }


  export function getStockExchangeCode(account: Bkper.Account): string {
    if (account == null || account.getType() != BkperApp.AccountType.ASSET) {
      return null;
    }
    let groups = account.getGroups();
    if (groups != null) {
      for (const group of groups) {
        if (group == null) {
          continue;
        }
        let stockExchange = group.getProperty(STOCK_EXC_CODE_PROP);
        if (stockExchange != null && stockExchange.trim() != '') {
          return stockExchange;
        }
      }
    }
    return null;
  }


  export function isSale(transaction: Bkper.Transaction): boolean {
    return transaction.isPosted() && transaction.getDebitAccount().getType() == BkperApp.AccountType.OUTGOING;
  }

  export function isPurchase(transaction: Bkper.Transaction): boolean {
    return transaction.isPosted() && transaction.getCreditAccount().getType() == BkperApp.AccountType.INCOMING;
  }

  export function getExcCode(book: Bkper.Book): string {
    return book.getProperty(EXC_CODE_PROP, 'exchange_code');
  }


}

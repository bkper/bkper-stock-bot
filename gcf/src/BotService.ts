import { Account, AccountType, Bkper, Book, Group, Transaction } from 'bkper';
import { CalculationModel } from './CalculationModel';
import { EXC_BASE_PROP, EXC_CODE_PROP, LEGACY_REALIZED_DATE_PROP, NEEDS_REBUILD_PROP, REALIZED_DATE_PROP, STOCK_BOOK_PROP, STOCK_EXC_CODE_PROP, STOCK_FAIR_PROP, STOCK_HISTORICAL_PROP } from './constants';

export function isStockBook(book: Book): boolean {
  if (book.getProperty(STOCK_BOOK_PROP)) {
    return true;
  }
  if (book.getFractionDigits() == 0) {
    return true;
  }
  return false;
}

export function getBaseBook(book: Book): Book {
  const collection = book.getCollection();
  // No collection found
  if (collection == null) {
    return null;
  }
  const connectedBooks = collection.getBooks();
  for (const connectedBook of connectedBooks) {
    if (connectedBook.getProperty(EXC_BASE_PROP)) {
      return connectedBook;
    }
  }
  // No base book found: return USD book
  for (const connectedBook of connectedBooks) {
    if (getExcCode(connectedBook) === 'USD') {
      return connectedBook;
    }
  }
  return null;
}

export function getStockBook(book: Book): Book {
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

export async function getExchangeCode(account: Account): Promise<string> | null {
  if (account.getType() == AccountType.INCOMING || account.getType() == AccountType.OUTGOING) {
    return null;
  }
  let groups = await account.getGroups();
  if (groups != null) {
    for (const group of groups) {
      if (group == null) {
        continue;
      }
      let excCode = group.getProperty(STOCK_EXC_CODE_PROP);
      if (excCode != null && excCode.trim() != '') {
        return excCode;
      }
    }
  }
  return null;
}

export async function getFinancialBook(book: Book, excCode?: string): Promise<Book> {
  if (book.getCollection() == null) {
    return null;
  }
  let connectedBooks = book.getCollection().getBooks();
  for (const connectedBook of connectedBooks) {
    let excCodeConnectedBook = getExcCode(connectedBook);
    let fractionDigits = connectedBook.getFractionDigits();
    if (fractionDigits != 0 && excCode == excCodeConnectedBook) {
      return Bkper.getBook(connectedBook.getId());
    }
  }
  return null;
}

export async function getStockAccount(stockTransaction: Transaction): Promise<Account> {
  if (await isSale(stockTransaction)) {
    return await stockTransaction.getCreditAccount();
  }
  if (await isPurchase(stockTransaction)) {
    return await stockTransaction.getDebitAccount();
  }
  return null;
}

export async function flagStockAccountForRebuildIfNeeded(stockTransaction: Transaction) {
  let stockAccount = await getStockAccount(stockTransaction);
  if (stockAccount) {
    let lastTxDate = getRealizedDateValue(stockAccount);
    if (lastTxDate != null && stockTransaction.getDateValue() <= +lastTxDate) {
      await stockAccount.setProperty(NEEDS_REBUILD_PROP, 'TRUE').update();
    }
  }
}

export function getRealizedDateValue(account: Account): number | null {
  const legacyRealizedDate = account.getProperty(LEGACY_REALIZED_DATE_PROP);
  if (legacyRealizedDate) {
    return +legacyRealizedDate;
  }
  const realizedDate = account.getProperty(REALIZED_DATE_PROP)
  if (realizedDate) {
    return +(realizedDate.replace(/-/g, ""))
  }
  return null
}

export function getStockExchangeCode(account: bkper.Account): string {
  if (account == null || account.type == AccountType.INCOMING || account.type == AccountType.OUTGOING) {
    return null;
  }
  let groups = account.groups;
  if (groups != null) {
    for (const group of groups) {
      if (group == null) {
        continue;
      }

      let stockExchange = group.properties[STOCK_EXC_CODE_PROP];
      if (stockExchange != null && stockExchange.trim() != '') {
        return stockExchange;
      }
    }
  }

  return null;
}

export async function getStockExchangeGroup(account: Account): Promise<Group> {
  if (account == null || account.getType() != AccountType.ASSET) {
    return null;
  }
  let groups = await account.getGroups();
  if (groups != null) {
    for (const group of groups) {
      let stockExchange = group.getProperty(STOCK_EXC_CODE_PROP);
      if (stockExchange != null && stockExchange.trim() != '') {
        return group;
      }
    }
  }
  return null;
}

export async function isSale(transaction: Transaction): Promise<boolean> {
  return transaction.isPosted() && (await transaction.getDebitAccount()).getType() == AccountType.OUTGOING;
}

export async function isPurchase(transaction: Transaction): Promise<boolean> {
  return transaction.isPosted() && (await transaction.getCreditAccount()).getType() == AccountType.INCOMING;
}

export function getExcCode(book: Book): string {
  return book.getProperty(EXC_CODE_PROP, 'exchange_code');
}

function isFlaggedAsHistorical(stockBook: Book): boolean {
  const stockHistoricalProp = stockBook.getProperty(STOCK_HISTORICAL_PROP);
  return stockHistoricalProp && stockHistoricalProp.trim().toLowerCase() === 'true' ? true : false;
}

function isFlaggedAsFair(stockBook: Book): boolean {
  const stockFairProp = stockBook.getProperty(STOCK_FAIR_PROP);
  return stockFairProp && stockFairProp.trim().toLowerCase() === 'true' ? true : false;
}

function isHistoricalOnly(stockBook: Book): boolean {
  return isFlaggedAsHistorical(stockBook) && !isFlaggedAsFair(stockBook);
}

function isFairOnly(stockBook: Book): boolean {
  return isFlaggedAsFair(stockBook) && !isFlaggedAsHistorical(stockBook);
}

export function getCalculationModel(stockBook: Book): CalculationModel {
  if (isHistoricalOnly(stockBook)) {
      return CalculationModel.HISTORICAL_ONLY;
  }
  if (isFairOnly(stockBook)) {
      return CalculationModel.FAIR_ONLY;
  }
  return CalculationModel.BOTH;
}
namespace ForwardDateService {

    export function forwardDate(stockBookId: string, stockAccountId: string, date: string): Summary {
        const stockBook = BkperApp.getBook(stockBookId);
        const stockAccount = new StockAccount(stockBook.getAccount(stockAccountId));
        let forwardedDateValue = stockAccount.getForwardedDateValue();
        let dateValue = +(date.replaceAll('-', ''));
        if (forwardedDateValue && dateValue == forwardedDateValue) {
            return {
                accountId: stockAccountId,
                result: `Cannot set forward date: forwarded date is already ${date}`
            }
        } else if (forwardedDateValue && dateValue < forwardedDateValue) {
            if (!isUserBookOwner(stockBook)) {
                throw `Cannot fix forward date: user must be book owner`;
            }
            if (!isCollectionUnlocked(stockBook)) {
                throw `Cannot fix forward date: collection has locked/closed book(s)`;
            }
            return fixAndForwardDateForAccount(stockBook, stockAccount, date);
        } else {
            return forwardDateForAccount(stockBook, stockAccount, date, false);
        }
    }

    function fixAndForwardDateForAccount(stockBook: Bkper.Book, stockAccount: StockAccount, forwardDate: string): Summary {

        // Reset results up to current forwarded date
        RealizedResultsService.resetRealizedResultsForAccount(stockBook, stockAccount, false);

        // Fix previous forward
        let iterator = stockBook.getTransactions(`account:'${stockAccount.getName()}' after:${stockAccount.getForwardedDate()}`);
        let forwardedTransactions: Bkper.Transaction[] = [];
        while (iterator.hasNext()) {
            const tx = iterator.next();
            if (tx.getProperty('fwd_log')) {
                forwardedTransactions.push(tx);
            }
        }
        for (const transaction of forwardedTransactions) {
            // Get forwarded transaction previous state
            let previousStateTx = getForwardedTransactionPreviousState(stockBook, stockAccount, transaction, forwardDate);
            // Return forwarded transaction to previous state
            transaction
                .setDate(previousStateTx.getDate())
                .setProperties(previousStateTx.getProperties())
                .deleteProperty('fwd_tx')
                .deleteProperty('fwd_tx_remote_ids')
                .update()
            ;
            stockAccount.pushTrash(previousStateTx);
        }
        // Delete unnecessary transactions
        stockAccount.cleanTrash();

        // Reset results up to new forward date
        const resetIterator = stockBook.getTransactions(`account:'${stockAccount.getName()}' after:${forwardDate}`);
        RealizedResultsService.resetRealizedResultsForAccount(stockBook, stockAccount, false, resetIterator);

        // Set new forward date
        const newForward = forwardDateForAccount(stockBook, stockAccount, forwardDate, true);

        return {
            accountId: stockAccount.getId(),
            result: `${forwardedTransactions.length} fixed and ${newForward.result}`
        }
    }

    function forwardDateForAccount(stockBook: Bkper.Book, stockAccount: StockAccount, forwardDate: string, fixingForward: boolean): Summary {

        // Do not allow forward if account needs rebuild
        if (stockAccount.needsRebuild()) {
            return {
                accountId: stockAccount.getId(),
                result: `Cannot set forward date: account needs rebuild`
            }
        }

        const baseBook = BotService.getBaseBook(stockBook);
        const baseExcCode = BotService.getExcCode(baseBook);
        
        const stockExcCode = stockAccount.getExchangeCode();
        const financialBook = BotService.getFinancialBook(stockBook, stockExcCode);

        // Closing Date: Forward Date - 1 day
        const closingDate = new Date();
        closingDate.setTime(stockBook.parseDate(forwardDate).getTime());
        closingDate.setDate(closingDate.getDate() - 1);
        // Closing Date ISO
        const closingDateISO = Utilities.formatDate(closingDate, stockBook.getTimeZone(), "yyyy-MM-dd");

        let stockBookBalancesReport = stockBook.getBalancesReport(`account:'${stockAccount.getName()}' on:${stockBook.formatDate(closingDate)}`);
        let baseBookBalancesReport = baseBook.getBalancesReport(`account:'${stockAccount.getName()}' on:${baseBook.formatDate(closingDate)}`);
        let financialBookBalancesReport = financialBook.getBalancesReport(`account:'${stockAccount.getName()}' on:${financialBook.formatDate(closingDate)}`);

        let needToRecordLiquidationTx = true;

        // Open amount from Base Book
        const openAmountBase = baseBookBalancesReport.getBalancesContainer(stockAccount.getName()).getCumulativeBalanceRaw();
        // Open amount from Local Book
        const openAmountLocal = financialBookBalancesReport.getBalancesContainer(stockAccount.getName()).getCumulativeBalanceRaw();
        // Open quantity from Stock Book
        let openQuantity = stockBookBalancesReport.getBalancesContainer(stockAccount.getName()).getCumulativeBalanceRaw();
        if (openQuantity.eq(0) && fixingForward) {
            openQuantity = tryOpenQuantityFromLiquidationTx(stockBook, stockAccount, closingDateISO);
            if (!openQuantity.eq(0)) {
                needToRecordLiquidationTx = false;
            }
        }
        // Current price
        const fwdPrice = !openQuantity.eq(0) ? openAmountLocal.div(openQuantity) : undefined;
        // Current exchange rate
        const fwdExcRate = !openAmountLocal.eq(0) ? openAmountBase.div(openAmountLocal) : undefined;

        let iterator = stockBook.getTransactions(`account:'${stockAccount.getName()}' before:${forwardDate}`);
        let transactions: Bkper.Transaction[] = [];

        while (iterator.hasNext()) {
            const tx = iterator.next();
            if (!tx.isChecked()) {
                transactions.push(tx);
            }
        }

        transactions = transactions.sort(BotService.compareToFIFO);
        
        let logTransactionsIds: string[] = [];
        let transactionsToCheck: Bkper.Transaction[] = [];
        let order = -transactions.length;

        for (const transaction of transactions) {

            // Post copy of transaction in order to keep a forward history
            let logTransaction = buildLogTransaction(stockBook, transaction).post();

            // Forward transaction
            forwardTransaction(transaction, logTransaction, stockExcCode, baseExcCode, fwdPrice, fwdExcRate, forwardDate, order);

            logTransactionsIds.push(logTransaction.getId());
            transactionsToCheck.push(logTransaction);
            order++;
        }

        // Record new transaction liquidating the logs
        if (needToRecordLiquidationTx && !openQuantity.eq(0)) {
            let liquidationTransaction = buildLiquidationTransaction(stockBook, stockAccount, openQuantity, closingDate, forwardDate);
            liquidationTransaction
                .setProperty('fwd_liquidation', JSON.stringify(logTransactionsIds))
                .post()
            ;
            transactionsToCheck.push(liquidationTransaction);
        }

        // Check logs and liquidation transaction
        stockBook.batchCheckTransactions(transactionsToCheck);

        // Update stock account
        updateStockAccount(stockAccount, stockExcCode, baseExcCode, fwdPrice, fwdExcRate, forwardDate);

        if (isForwardedDateSameOnAllAccounts(stockBook, forwardDate) && stockBook.getClosingDate() != closingDateISO) {
            // Prevent book from closing before last transaction check
            Utilities.sleep(5000);
            stockBook.setClosingDate(closingDateISO).update();
            return {
                accountId: stockAccount.getId(),
                result: `${transactions.length} forwarded to ${forwardDate} and book closed on ${stockBook.formatDate(closingDate)}`
            }
        } else {
            return {
                accountId: stockAccount.getId(),
                result: `${transactions.length} forwarded to ${forwardDate}`
            }
        }

    }

    function forwardTransaction(transaction: Bkper.Transaction, logTransaction: Bkper.Transaction, stockExcCode: string, baseExcCode: string, fwdPrice: Bkper.Amount, fwdExcRate: Bkper.Amount, forwardDate: string, order: number): void {
        if (!transaction.getProperty(DATE_PROP)) {
            transaction.setProperty(DATE_PROP, transaction.getDate());
        }
        if (!transaction.getProperty(HIST_QUANTITY_PROP)) {
            transaction.setProperty(HIST_QUANTITY_PROP, transaction.getProperty(ORIGINAL_QUANTITY_PROP));
        }
        if (!transaction.getProperty(HIST_ORDER_PROP)) {
            transaction.setProperty(HIST_ORDER_PROP, transaction.getProperty(ORDER_PROP));
        }
        if (BotService.isPurchase(transaction)) {
            transaction.setProperty(FWD_PURCHASE_PRICE_PROP, fwdPrice ? fwdPrice.toString() : undefined);
            if (stockExcCode !== baseExcCode) {
                transaction.setProperty(FWD_PURCHASE_EXC_RATE_PROP, fwdExcRate ? fwdExcRate.toString() : undefined);
            }
        }
        if (BotService.isSale(transaction)) {
            transaction.setProperty(FWD_SALE_PRICE_PROP, fwdPrice ? fwdPrice.toString() : undefined);
            if (stockExcCode !== baseExcCode) {
                transaction.setProperty(FWD_SALE_EXC_RATE_PROP, fwdExcRate ? fwdExcRate.toString() : undefined);
            }
        }
        transaction
            .deleteProperty(ORIGINAL_AMOUNT_PROP)
            .setProperty(ORIGINAL_QUANTITY_PROP, transaction.getAmount().toString())
            .setProperty(ORDER_PROP, order + '')
            .setProperty('fwd_log', logTransaction.getId())
            .setDate(forwardDate)
            .update()
        ;
    }

    function updateStockAccount(stockAccount: StockAccount, stockExcCode: string, baseExcCode: string, fwdPrice: Bkper.Amount, fwdExcRate: Bkper.Amount, forwardDate: string): void {
        stockAccount
            .setRealizedDate(forwardDate)
            .setForwardedDate(forwardDate)
            .setForwardedPrice(fwdPrice)
        ;
        if (stockExcCode !== baseExcCode) {
            stockAccount.setForwardedExcRate(fwdExcRate);
        }
        stockAccount.update();
    }

    function isForwardedDateSameOnAllAccounts(stockBook: Bkper.Book, forwardedDate: string): boolean {
        for (const account of stockBook.getAccounts()) {
            const stockAccount = new StockAccount(account)
            if (stockAccount.isPermanent() && !stockAccount.isArchived() && stockAccount.getExchangeCode()) {
                if (stockAccount.getForwardedDate() != forwardedDate) {
                    return false
                }
            }
        }
        return true;
    }

    function buildLogTransaction(stockBook: Bkper.Book, transaction: Bkper.Transaction): Bkper.Transaction {
        const remoteIds: string[] = transaction.getRemoteIds() || [];
        return stockBook.newTransaction()
            .setAmount(transaction.getAmount())
            .from(transaction.getCreditAccount())
            .to(transaction.getDebitAccount())
            .setDate(transaction.getDate())
            .setDescription(transaction.getDescription())
            .setProperties(transaction.getProperties())
            .setProperty('fwd_tx', transaction.getId())
            .setProperty('fwd_tx_remote_ids', JSON.stringify(remoteIds))
        ;
    }

    function buildLiquidationTransaction(stockBook: Bkper.Book, stockAccount: StockAccount, quantity: Bkper.Amount, closingDate: Date, forwardDate: string): Bkper.Transaction {
        const fromAccountName = quantity.lt(0) ? stockAccount.getName() : 'Buy';
        const toAccountName = quantity.lt(0) ? 'Sell' : stockAccount.getName();
        return stockBook.newTransaction()
            .setAmount(quantity.abs())
            .from(fromAccountName)
            .to(toAccountName)
            .setDate(closingDate)
            .setDescription(`${quantity.times(-1)} units forwarded to ${forwardDate}`)
        ;
    }

    function isUserBookOwner(stockBook: Bkper.Book): boolean {
        return stockBook.getPermission() == BkperApp.Permission.OWNER;
    }

    function isCollectionUnlocked(stockBook: Bkper.Book): boolean {
        const books = stockBook.getCollection().getBooks();
        for (const book of books) {
            let lockDate = book.getLockDate();
            if (lockDate && lockDate !== '1900-00-00') {
                return false;
            }
            let closingDate = book.getClosingDate();
            if (closingDate && closingDate !== '1900-00-00') {
                return false;
            }
        }
        return true;
    }

    function getForwardedTransactionPreviousState(stockBook: Bkper.Book, stockAccount: StockAccount, transaction: Bkper.Transaction, forwardDate: string): Bkper.Transaction {
        const previousStateId = transaction.getProperty('fwd_log');
        if (!previousStateId) {
            return transaction;
        }
        const previousStateTx = stockBook.getTransaction(previousStateId);
        if (!previousStateTx) {
            return transaction;
        }
        if (previousStateTx.getDateValue() <= +(forwardDate.replaceAll('-', ''))) {
            return previousStateTx;
        }
        stockAccount.pushTrash(previousStateTx);
        return getForwardedTransactionPreviousState(stockBook, stockAccount, previousStateTx, forwardDate);
    }

    function tryOpenQuantityFromLiquidationTx(stockBook: Bkper.Book, stockAccount: StockAccount, closingDate: string): Bkper.Amount {
        const iterator = stockBook.getTransactions(`account:'${stockAccount.getName()}' on:${closingDate}`);
        while (iterator.hasNext()) {
            const tx = iterator.next();
            if (tx.getProperty('fwd_liquidation')) {
                if (BotService.isPurchase(tx)) {
                    return tx.getAmount();
                }
                if (BotService.isSale(tx)) {
                    return tx.getAmount().times(-1);
                }
            }
        }
        return BkperApp.newAmount(0);
    }

}

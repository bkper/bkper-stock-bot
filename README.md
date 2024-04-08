Manage Stock Book in sync with Financial Books upon buying and seling inventory instruments.

![Stock Bot](https://docs.google.com/drawings/d/e/2PACX-1vQSjFxT6jVtwaiuDOEaDOaruFHWDp8YtT91lNUCw4BruKm3ZED__g1D4-5iAoi-J23j4v55Tk6ETg9R/pub?w=2848&h=1306)

It works by monitoring Financial Books and tracking quantities of instruments bought or sold in a separate Stock Book.

The process of tracking realized gains and losses upon sales follows the FIFO ([First-In, First-Out](https://medium.com/magnimetrics/first-in-first-out-fifo-inventory-costing-f0bc00096a59)) method.


## Configuration

Financial and Instruments Books **must be in the same [Collection](https://help.bkper.com/en/articles/4208937-collections)**.

A single Instruments Book must be defined per Collection.

The Instruments Book is identified by a single book in the Collection with the **decimal places set to 0 (zero)** or by the ```stock_book``` property set to ```true```.

A single Base Book can be defined per Collection. See [Realized Results Service](#realized-results-service).

The Base Book is identified by the ```exc_base``` property set to ```true```.

The Stock Bot interacts with the following properties:

### Book Properties

#### Financial Books
- ```exc_code```: Required - The book exchange code to match the ```stock_exc_code```.
#### Instruments Book
- ```stock_historical```: Optional - true/false - Defines if realized results calculations should consider **only** historical costs and rates. If set to false or not present, calculations will consider **both** historical and fair values. For more information, check out this article on [Mark-To-Market vs. Historical Cost accounting](https://www.investopedia.com/ask/answers/042315/how-market-market-accounting-different-historical-cost-accounting.asp).
- ```stock_book```: Optional - true/false - Identifies the Instruments book of the collection. If not present, decimal places must be set to 0 (zero) in the book settings.

### Group Properties

- ```stock_exc_code```: Required - Defines the exchange code of the instrument that will have quantities mirrored into the Stock Book. Only transactions with accounts within groups with ```stock_exc_code``` set will be mirrored.

### Account Properties

- ```stock_fees_account```: Optional - The fees account used by the broker account. The broker account is identified by having an associated fees account.

### Transaction Properties 

- ```instrument```: Required - The instrument name.
- ```quantity```: Required - The quantity of the instrument stock operation to track.
- ```trade_date```: Required - The date of the stock operation.
- ```order```: Optional - The order of the operation, if multiple operations happened in the same day.
- ```fees```: Optional - The value included in the transaction amount corresponding to fees. 
- ```interest```: Optional - The value included in the transaction amount corresponding to interests.
- ```cost_hist```: Optional - The historical amount representing the cost of the transaction.


## Realized Results Service

The process of calculating realized results follows the FIFO method. In this process, the Stock Bot can record transactions in the Instruments and financial books. If a Base Book is defined in the collection, realized exchange results will be recorded separately from stock market realized results.

When calculating realized results, the market value of remaining instruments can be automatically adjusted on Financial Books to match the last realized price of that instrument. This valuation procedure is known as [Mark-To-Market](https://www.investopedia.com/terms/m/marktomarket.asp). For liquidated Bonds instruments, the Stock Bot can also perform this valuation on associated Interest accounts.

The Stock Bot adds the following properties to the generated transactions in the Instruments Book:

- ```purchase_amount/fwd_purchase_amount```: The financial amount the instrument was bought.
- ```purchase_price/fwd_purchase_price```: The unit price the instrument was bought.
- ```purchase_exc_rate/fwd_purchase_exc_rate```: The exchange rate (local currency to base currency) when the instrument was bought.
- ```sale_amount/fwd_sale_amount```: The financial amount the instrument was sold.
- ```sale_price/fwd_sale_price```: The unit price the instrument was sold.
- ```sale_exc_rate/fwd_sale_exc_rate```: The exchange rate (local currency to base currency) when the instrument was sold.
- ```sale_date```: The date when the instrument was sold.
- ```original_quantity```: The original quantity of the instrument (used to rebuild FIFO gains/losses if needed).

**Observations:**
Other properties can be created by the Stock Bot when it runs a process, for operational and logging purposes. The properties starting with ```fwd``` above have the same meaning as their peers, but their values may differ if a [Forward Date](#forward-date-service) was set to that instrument. In that case, there are also other ```fwd``` properties, which are references that connect forwarded transactions to their logs.


## Forward Date Service

In order to [close a period](https://help.bkper.com/en/articles/6000644-closing-a-period) and [set a closing date](https://help.bkper.com/en/articles/5100445-book-closing-and-lock-dates) to the Stock Book, instruments must be carried to the next period. The proper way to do so is by setting a Forward Date to the accounts in the Instruments Book.

Each unchecked transaction will have its date, price and exchange rate updated to the current valuation, leaving a log of its previous state behind. When the last instrument is successfully forwarded a closing date will be set on the Stock Book one day before the Forward Date.

Once an instrument is forwarded, future FIFO calculations will consider the new Forward valuation. In order to calculate gains/losses only over the historical basis, the property ```stock_historical``` must be ```true``` on the Instruments Book.

When forwarding instruments, the Stock Bot also adds the following properties to the forwarded transactions:

- ```date```: The date when the transaction has occurred.
- ```hist_order```: The historical index the transaction had before being forwarded.
- ```hist_quantity```: The historical quantity of the instrument (used to rebuild FIFO gains/losses if needed).
- ```fwd_log```: The id of the forwarded transaction previous state (a copy of the transaction before being forwarded).

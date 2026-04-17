import './Menu.css'

interface MenuProps {
  balance: number
  onDeposit: (amount: number) => void
}

function Menu({ balance, onDeposit }: MenuProps) {
  return (
    <div className="menu">
      <div className="balance-display">
        <span className="balance-label">Balance:</span>
        <span className="balance-amount">£{balance.toFixed(2)}</span>
      </div>
      <button
        className="deposit-btn"
        onClick={() => onDeposit(5)}
      >
        Deposit £5
      </button>
    </div>
  )
}

export default Menu

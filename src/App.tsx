import { useState } from 'react'
import SlotMachine from './components/SlotMachine'
import Menu from './components/Menu'
import './App.css'

function App() {
  const [balance, setBalance] = useState(10) // Start with £10

  const deposit = (amount: number) => {
    setBalance(prev => prev + amount)
  }

  const updateBalance = (amount: number) => {
    setBalance(prev => prev + amount)
  }

  return (
    <div className="app">
      <h1>Fruit Bonanza Extreme</h1>
      <Menu balance={balance} onDeposit={deposit} />
      <SlotMachine balance={balance} onBalanceChange={updateBalance} />
    </div>
  )
}

export default App

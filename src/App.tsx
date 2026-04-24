import { useState } from 'react'
import SlotMachine from './components/SlotMachine'
import Menu from './components/Menu'
import SimLab from './components/SimLab'
import { useLocalStorage } from './hooks/useLocalStorage'
import './App.css'

type Tab = 'game' | 'sim'

function App() {
  const [balance, setBalance] = useLocalStorage('slots_balance', 10)
  const [tab, setTab] = useState<Tab>('game')

  const deposit = (amount: number) => setBalance(prev => prev + amount)
  const updateBalance = (amount: number) => setBalance(prev => prev + amount)

  return (
    <div className="app">
      <div className="app-header">
        <h1>Fruit Bonanza Extreme</h1>
        <nav className="app-tabs">
          <button
            className={`app-tab ${tab === 'game' ? 'active' : ''}`}
            onClick={() => setTab('game')}
          >
            Game
          </button>
          <button
            className={`app-tab ${tab === 'sim' ? 'active' : ''}`}
            onClick={() => setTab('sim')}
          >
            Simulation Lab
          </button>
        </nav>
      </div>

      {tab === 'game' && (
        <>
          <Menu balance={balance} onDeposit={deposit} />
          <SlotMachine balance={balance} onBalanceChange={updateBalance} />
        </>
      )}

      {tab === 'sim' && <SimLab />}
    </div>
  )
}

export default App

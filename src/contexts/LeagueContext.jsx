import React, { createContext, useContext } from 'react'

const LeagueContext = createContext(null)

export function LeagueProvider({ children, league }) {
  return (
    <LeagueContext.Provider value={league}>
      {children}
    </LeagueContext.Provider>
  )
}

export function useLeague() {
  const context = useContext(LeagueContext)
  if (!context) {
    throw new Error('useLeague must be used within LeagueProvider')
  }
  return context
}

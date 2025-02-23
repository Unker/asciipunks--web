import React, { useCallback, useEffect, useState } from 'react'
import abis from '@abis'
import cn from 'classnames'
import useInterval from '@use-it/interval'
import { useWeb3 } from 'eth-react'
import { Contract } from 'ethers'

import s from '@components/Button/NotificationButton.module.css'
import Noty from 'noty'
import Context from './Context'
import addresses from '../../addresses'

const Provider = ({ children }) => {
  const [nfts, setNfts] = useState([])
  const [totalSupply, setTotalSupply] = useState(0)
  const [tokenLimit, setTokenLimit] = useState(0)
  const [saleStarted, setSaleStarted] = useState(null)
  const [currentPrice, setCurrentPrice] = useState('')
  const [punks, setPunks] = useState(
    new Contract(addresses.asciiPunks, abis.asciiPunks)
  )

  const [names, setNames] = useState(new Contract(addresses.names, abis.names))
  const { wallet, walletAddress } = useWeb3()

  useEffect(() => {
    ;(async function () {
      if (!punks) return

      try {
        await punks.deployed()
        punks.on(
          'Generated',
          (tokenId, address, token, { transactionHash }) => {
            if (address == walletAddress) {
              const noty = new Noty({
                layout: 'bottom',
                buttons: [
                  Noty.button('Etherscan', cn(s.button, s.small), () =>
                    window.open(
                      `${
                        process.env.ETHERSCAN_BASE || 'https://etherscan.com'
                      }/tx/${transactionHash}`,
                      '_blank'
                    )
                  ),
                  /*
            Noty.button('Tweet', cn(s.button, s.small), () => {
              const encodedPunk = encodeURIComponent(token)
              const previewLink = `https://carbon.now.sh/?l=txt&code=${encodedPunk}&fm=Fira%20Code`
              const tweetBody = `Check out this new punk I just minted on https://asciipunks.com ${previewLink}`
              const tweetLink = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetBody)}`

              window.open(tweetLink, '_blank')
            }),
            */
                ],
                text: `Punk #${tokenId} minted— your punk is ready!
          <div style="padding: 16px 0; display: flex; font-family: 'Unimono', monospace; justify-content: center;"><pre style="display: inline-block;">${token}</pre></div>`,
                timeout: 4000,
              }).show()
            }
          }
        )
      } catch (e) {}
    })()

    return () => punks.off('Generated')
  }, [punks])

  useEffect(() => {
    if (!!wallet && !punks.signer) {
      setPunks(punks.connect(wallet))
      setNames(names.connect(wallet))
    }
  }, [wallet, setPunks, punks])

  const punksForUser = useCallback(
    async (userAddress) => {
      const address = userAddress || walletAddress
      if (!address || !punks.signer) return []
      const userPunks = []

      const balance = (await punks.balanceOf(address)).toNumber()
      for (let index = 0; index < balance; index++) {
        const id = (await punks.tokenOfOwnerByIndex(address, index)).toNumber()
        userPunks.push({ punk: await punks.draw(id), id })
      }

      const namedPunks = await Promise.all(
        userPunks.map(async (nft) => ({ ...nft, name: await fetchNameById(nft.id) }))
      )

      return namedPunks
    },
    [punks, walletAddress]
  )

  const drawPunk = useCallback(async (id) => await punks.draw(id), [punks])
  const ownerOf = useCallback(async (id) => await punks.ownerOf(id), [punks])

  const totalPunks = useCallback(async () => {
    if (!walletAddress || !punks.signer) return []

    const newTotalSupply = (await punks.totalSupply()).toNumber()
    const newTokenLimit = (await punks.TOKEN_LIMIT()).toNumber()

    return { totalSupply: newTotalSupply, tokenLimit: newTokenLimit }
  }, [punks, walletAddress])

  const getSaleStarted = useCallback(async () => {
    if (!walletAddress || !punks.signer) return null

    const started = await punks.hasSaleStarted()
    return started
  }, [punks, walletAddress])

  const calculateCurrentPrice = useCallback(async () => {
    const { totalSupply } = await totalPunks()
    let currentPrice

    if (totalSupply < 256) {
      currentPrice = '50000000000000000'
    } else if (totalSupply >= 256 && totalSupply < 512) {
      currentPrice = '100000000000000000'
    } else if (totalSupply >= 512 && totalSupply < 1024) {
      currentPrice = '200000000000000000'
    } else if (totalSupply >= 1024 && totalSupply < 1536) {
      currentPrice = '300000000000000000'
    } else {
      currentPrice = '400000000000000000'
    }
    return currentPrice
  }, [totalPunks])

  const fetchTokens = useCallback(async () => {
    const nfts = await punksForUser()
    const enrichedNfts = await Promise.all(
      nfts.map(async (nft) => ({ ...nft, name: await fetchNameById(nft.id) }))
    )
    setNfts(enrichedNfts)

    const { totalSupply, tokenLimit } = await totalPunks()
    const started = await getSaleStarted()
    const currentPrice = await calculateCurrentPrice()
    setSaleStarted(started)
    setTotalSupply(totalSupply)
    setTokenLimit(tokenLimit)
    setCurrentPrice(currentPrice)
  }, [
    setTotalSupply,
    setTokenLimit,
    setSaleStarted,
    setNfts,
    setCurrentPrice,
    currentPrice,
    punksForUser,
    totalPunks,
    getSaleStarted,
  ])

  const fetchNameById = useCallback(
    async (id) => {
      if (!names?.signer) return ''

      return await names.getName(id)
    },
    [names]
  )

  const setName = useCallback(
    async (id, name) => {
      if (!names?.signer) return

      return await names.setName(id, name, {
        value: 0,
        from: walletAddress,
      })
    },
    [names]
  )

  const fetchTokensById = useCallback(
    async (ids) => {
      const nfts = await Promise.all(
        ids.map(async (id) => ({ id, token: await punks.draw(id) }))
      )
      return await Promise.all(
        nfts.map(async (nft) => ({ ...nft, name: await fetchNameById(nft.id) }))
      )
    },
    [punks]
  )

  useInterval(async () => {
    fetchTokens()
  }, 5000)

  useEffect(() => {
    fetchTokens()
  }, [fetchTokens])

  const createPunk = useCallback(
    async (seed) => {
      await punks.createPunk(seed, {
        value: currentPrice,
        from: walletAddress,
        gasLimit: 200000,
      })

      const { totalSupply, tokenLimit } = await totalPunks()
      setTotalSupply(totalSupply)
      setTokenLimit(tokenLimit)
      setNfts(await punksForUser())
    },
    [
      punks,
      currentPrice,
      walletAddress,
      totalPunks,
      setTotalSupply,
      setTokenLimit,
      setNfts,
      punksForUser,
    ]
  )

  return (
    <Context.Provider
      value={{
        createPunk,
        currentPrice,
        drawPunk,
        fetchTokensById,
        fetchNameById,
        nfts,
        ownerOf,
        punksForUser,
        saleStarted,
        setName,
        tokenLimit,
        totalSupply,
      }}
    >
      {children}
    </Context.Provider>
  )
}

export default Provider

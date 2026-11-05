import { Alert, Button } from '@kyc/ui'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { Outlet, useNavigate } from 'react-router'

import { deleteApplicantSession } from '../api/applicant-sessions'

import styles from './applications-layout.module.css'

export default function ApplicationsLayout() {
  const navigate = useNavigate()
  const [failed, setFailed] = useState(false)
  const signOut = useMutation({ mutationFn: deleteApplicantSession })

  function handleSignOut() {
    if (signOut.isPending) {
      return
    }
    setFailed(false)
    signOut.mutate(undefined, {
      onSuccess: (result) => {
        if (result.kind === 'signed-out') {
          // Replace so Back does not return to a page that needs a session.
          void navigate('/sign-in', { replace: true })
        } else {
          setFailed(true)
        }
      },
      onError: () => setFailed(true),
    })
  }

  return (
    <>
      <header className={styles.header}>
        <Button
          isPending={signOut.isPending}
          onPress={handleSignOut}
          size="small"
          variant="quiet"
        >
          {signOut.isPending ? 'Signing out…' : 'Sign out'}
        </Button>
      </header>
      {failed ? (
        <Alert className={styles.alert} severity="error">
          You could not be signed out. Check your connection and try again.
        </Alert>
      ) : null}
      <Outlet />
    </>
  )
}

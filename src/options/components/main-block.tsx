import { FunctionComponent } from 'preact';
import { model } from 'options/settings-model';
import { BackendConnectionState } from 'common/backend-connection-state';
import { ConnectionBlock } from './connect/connection-block';
import { Shortcuts } from './shortcuts';
import { Footer } from './footer';
import { Usage } from './usage';

const MainBlock: FunctionComponent = () => {
    return (
        <>
            <ConnectionBlock />
            {model.backendConnectionState === BackendConnectionState.Connected ? <Usage /> : null}
            <Shortcuts />
            <Footer />
        </>
    );
};

export { MainBlock };

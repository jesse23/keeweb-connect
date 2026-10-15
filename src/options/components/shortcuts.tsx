import { FunctionComponent } from 'preact';
import { res } from 'options/utils';
import { model } from 'options/settings-model';

const Shortcuts: FunctionComponent = () => {
    const openShortcuts = (e: Event) => {
        e.preventDefault();
        void chrome.tabs.create({ url: 'chrome://extensions/shortcuts', active: true });
    };

    return (
        <>
            <h2 id="shortcuts">{res('optionsShortcuts')}</h2>
            <p>{res('optionsShortcutsDescription')}</p>
            <ul>
                {model.allShortcuts.map((command) => (
                    <li key={command.name}>
                        {command.description}: {command.shortcut || res('optionsShortcutNotSet')}
                    </li>
                ))}
            </ul>
            <p>
                <button type="button" onClick={openShortcuts}>
                    {res('optionsShortcutsLink')}
                </button>
            </p>
        </>
    );
};

export { Shortcuts };

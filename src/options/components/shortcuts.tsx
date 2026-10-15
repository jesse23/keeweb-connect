import { FunctionComponent } from 'preact';
import { res } from 'options/utils';
import { model } from 'options/settings-model';
import { canEditShortcuts, shortcutsCanBeEditedOnlyManually } from 'common/features';

const Shortcuts: FunctionComponent = () => {
    const openShortcuts = (e: Event) => {
        e.preventDefault();
        void chrome.tabs.create({ url: 'chrome://extensions/shortcuts', active: true });
    };

    return (
        <>
            <h2 id="shortcuts">{res('optionsShortcuts')}</h2>
            <p>
                {canEditShortcuts
                    ? res('optionsShortcutsDescription')
                    : res('optionsShortcutsDescriptionNoChange')}
            </p>
            <ul>
                {model.allShortcuts.map((command) => (
                    <li key={command.name}>
                        {command.description}: {command.shortcut || res('optionsShortcutNotSet')}
                    </li>
                ))}
            </ul>
            {canEditShortcuts ? (
                shortcutsCanBeEditedOnlyManually ? (
                    <>
                        <p>{res('optionsShortcutsManual')}</p>
                        <img srcset="../img/shortcuts.png 2x" alt="button" />
                    </>
                ) : (
                    <p>
                        <button type="button" onClick={openShortcuts}>
                            {res('optionsShortcutsLink')}
                        </button>
                    </p>
                )
            ) : null}
        </>
    );
};

export { Shortcuts };

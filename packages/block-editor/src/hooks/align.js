/**
 * External dependencies
 */
import classnames from 'classnames';
import { has, without, difference, concat } from 'lodash';

/**
 * WordPress dependencies
 */
import { createHigherOrderComponent } from '@wordpress/compose';
import { addFilter } from '@wordpress/hooks';
import {
	getBlockSupport,
	getBlockType,
	hasBlockSupport,
} from '@wordpress/blocks';
import { useSelect } from '@wordpress/data';
import { ToolbarGroup } from '@wordpress/components';

/**
 * Internal dependencies
 */
import {
	BlockControls,
	BlockAlignmentToolbar,
	__experimentalBlockFullHeightAligmentToolbar as FullHeightAlignmentToolbar,
} from '../components';

/**
 * An array which includes all possible valid alignments,
 * used to validate if an alignment is valid or not.
 *
 * @constant
 * @type {string[]}
 */
const REGULAR_ALIGNMENTS = [ 'left', 'center', 'right', 'wide', 'full' ];

/**
 * An array which includes all wide alignments.
 * In order for this alignments to be valid they need to be supported by the block,
 * and by the theme.
 *
 * @constant
 * @type {string[]}
 */
const WIDE_ALIGNMENTS = [ 'wide', 'full' ];

const VERTICAL_ALIGNMENTS = [ 'fullHeight' ];

/**
 * An array which contains all options that won't be
 * added by default, whn align property is True.
 */
const NOT_DEFAULT_ALIGNMENTS = [ 'fullHeight' ];

const ALL_ALIGNMENTS = concat( REGULAR_ALIGNMENTS, VERTICAL_ALIGNMENTS );

/**
 * Returns the valid alignments.
 * Takes into consideration the aligns supported by a block, if the block supports wide controls or not and if theme supports wide controls or not.
 * Exported just for testing purposes, not exported outside the module.
 *
 * @param {?boolean|string[]} blockAlign          Aligns supported by the block.
 * @param {?boolean}          hasWideBlockSupport True if block supports wide alignments. And False otherwise.
 * @param {?boolean}          hasWideEnabled      True if theme supports wide alignments. And False otherwise.
 *
 * @return {string[]} Valid alignments.
 */
export function getValidAlignments(
	blockAlign,
	hasWideBlockSupport = true,
	hasWideEnabled = true
) {
	let validAlignments;
	if ( Array.isArray( blockAlign ) ) {
		validAlignments = ALL_ALIGNMENTS.filter( ( value ) =>
			blockAlign.includes( value )
		);
	} else if ( blockAlign === true ) {
		// `true` includes all alignments...
		// except the not-default ones.
		validAlignments = REGULAR_ALIGNMENTS.filter(
			( value ) => ! NOT_DEFAULT_ALIGNMENTS.includes( value )
		);
	} else {
		validAlignments = [];
	}

	if (
		! hasWideEnabled ||
		( blockAlign === true && ! hasWideBlockSupport )
	) {
		return without( validAlignments, ...WIDE_ALIGNMENTS );
	}

	return validAlignments;
}

/**
 * Filters registered block settings, extending attributes to include `align`.
 *
 * @param  {Object} settings Original block settings
 * @return {Object}          Filtered block settings
 */
export function addAttribute( settings ) {
	// allow blocks to specify their own attribute definition with default values if needed.
	if ( has( settings.attributes, [ 'align', 'type' ] ) ) {
		return settings;
	}

	if ( hasBlockSupport( settings, 'align' ) ) {
		// Gracefully handle if settings.attributes is undefined.
		settings.attributes = {
			...settings.attributes,
			align: {
				type: 'string',
				// Allow for '' since it is used by updateAlignment function
				// in withToolbarControls for special cases with defined default values.
				enum: [ ...REGULAR_ALIGNMENTS, '' ],
			},
			fullHeightAlign: {
				type: 'boolean',
			},
		};
	}

	return settings;
}

/**
 * Override the default edit UI to include new toolbar controls for block
 * alignment, if block defines support.
 *
 * @param  {Function} BlockEdit Original component
 * @return {Function}           Wrapped component
 */
export const withToolbarControls = createHigherOrderComponent(
	( BlockEdit ) => ( props ) => {
		const { name: blockName } = props;
		// Compute valid alignments without taking into account,
		// if the theme supports wide alignments or not
		// and without checking the layout for availble alignments.
		// BlockAlignmentToolbar takes both of these into account.
		const validAlignments = getValidAlignments(
			getBlockSupport( blockName, 'align' ),
			hasBlockSupport( blockName, 'alignWide', true )
		);

		// Organize aligments by regular and vertical.
		const regularValidAlignments = difference(
			validAlignments,
			VERTICAL_ALIGNMENTS
		);

		const verticalValidAlignments = difference(
			validAlignments,
			REGULAR_ALIGNMENTS
		);

		const updateAlignment = ( nextAlign ) => {
			if ( ! nextAlign ) {
				const blockType = getBlockType( props.name );
				const blockDefaultAlign = blockType.attributes?.align?.default;
				if ( blockDefaultAlign ) {
					nextAlign = '';
				}
			}
			props.setAttributes( { align: nextAlign } );
		};

		const updateFullHeightAlignment = ( newFullHeightAlign ) => {
			props.setAttributes( { fullHeightAlign: newFullHeightAlign } );
		};

		return [
			validAlignments.length > 0 && props.isSelected && (
				<BlockControls key="align-controls">
					<ToolbarGroup>
						{ !! regularValidAlignments.length && (
							<BlockAlignmentToolbar
								value={ props.attributes.align }
								onChange={ updateAlignment }
								controls={ regularValidAlignments }
							/>
						) }

						{ !! verticalValidAlignments.indexOf( 'fullHeight' ) >=
							0 && (
							<FullHeightAlignmentToolbar
								isActive={ props.attributes.fullHeightAlign }
								onToggle={ updateFullHeightAlignment }
							/>
						) }
					</ToolbarGroup>
				</BlockControls>
			),
			<BlockEdit key="edit" { ...props } />,
		];
	},
	'withToolbarControls'
);

/**
 * Override the default block element to add alignment wrapper props.
 *
 * @param  {Function} BlockListBlock Original component
 * @return {Function}                Wrapped component
 */
export const withDataAlign = createHigherOrderComponent(
	( BlockListBlock ) => ( props ) => {
		const { name, attributes } = props;
		const { align } = attributes;
		const hasWideEnabled = useSelect(
			( select ) =>
				!! select( 'core/block-editor' ).getSettings().alignWide,
			[]
		);

		// If an alignment is not assigned, there's no need to go through the
		// effort to validate or assign its value.
		if ( align === undefined ) {
			return <BlockListBlock { ...props } />;
		}

		const validAlignments = getValidAlignments(
			getBlockSupport( name, 'align' ),
			hasBlockSupport( name, 'alignWide', true ),
			hasWideEnabled
		);

		let wrapperProps = props.wrapperProps;
		if ( validAlignments.includes( align ) ) {
			wrapperProps = { ...wrapperProps, 'data-align': align };
		}

		return <BlockListBlock { ...props } wrapperProps={ wrapperProps } />;
	}
);

/**
 * Override props assigned to save component to inject alignment class name if
 * block supports it.
 *
 * @param  {Object} props      Additional props applied to save element
 * @param  {Object} blockType  Block type
 * @param  {Object} attributes Block attributes
 * @return {Object}            Filtered props applied to save element
 */
export function addAssignedAlign( props, blockType, attributes ) {
	const { align } = attributes;
	const blockAlign = getBlockSupport( blockType, 'align' );
	const hasWideBlockSupport = hasBlockSupport( blockType, 'alignWide', true );

	// Compute valid alignments without taking into account if
	// the theme supports wide alignments or not.
	// This way changing themes does not impact the block save.
	const isAlignValid = getValidAlignments(
		blockAlign,
		hasWideBlockSupport
	).includes( align );
	if ( isAlignValid ) {
		props.className = classnames( `align${ align }`, props.className );
	}

	return props;
}

addFilter(
	'blocks.registerBlockType',
	'core/align/addAttribute',
	addAttribute
);
addFilter(
	'editor.BlockListBlock',
	'core/editor/align/with-data-align',
	withDataAlign
);
addFilter(
	'editor.BlockEdit',
	'core/editor/align/with-toolbar-controls',
	withToolbarControls
);
addFilter(
	'blocks.getSaveContent.extraProps',
	'core/align/addAssignedAlign',
	addAssignedAlign
);

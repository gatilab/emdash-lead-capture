<?php
/**
 * Read-only export of the Marketers Delight Lead Capture drop-in's data, for
 * the EmDash plugin's `import` route. Run with WP-CLI:
 *
 *   wp eval-file export-lead-capture.php > lead-capture.json
 *   wp eval-file export-lead-capture.php stats-only > lead-capture-stats.json
 *
 * Output: { leads: md_leads rows, stats: md_lead_stats rows, paths: { post_id: path },
 *           gmtOffsetMinutes }. Leads contain personal data; keep the file private.
 * Nothing is written to the database.
 */

global $wpdb;

$stats_only = in_array( 'stats-only', (array) ( $args ?? array() ), true );
$leads_table = $wpdb->prefix . 'md_leads';
$stats_table = $wpdb->prefix . 'md_lead_stats';

$table_exists = static function ( string $table ) use ( $wpdb ): bool {
	return $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $table ) ) === $table;
};

$leads = ( ! $stats_only && $table_exists( $leads_table ) ) ? $wpdb->get_results( "SELECT * FROM {$leads_table} ORDER BY id ASC", ARRAY_A ) : array();
$stats = $table_exists( $stats_table ) ? $wpdb->get_results( "SELECT * FROM {$stats_table} ORDER BY stat_date ASC, post_id ASC", ARRAY_A ) : array();

// Page paths for every post id the rows mention, so stats and leads land on
// the same URLs on the new site.
$post_ids = array_unique( array_filter( array_map( 'absint', array_merge(
	array_column( $leads, 'source_post_id' ),
	array_column( $stats, 'post_id' )
) ) ) );
$paths = array();
foreach ( $post_ids as $post_id ) {
	$link = get_permalink( $post_id );
	if ( $link ) {
		$paths[ (string) $post_id ] = (string) wp_parse_url( $link, PHP_URL_PATH );
	}
}

echo wp_json_encode( array(
	'format'           => 'md-lead-capture',
	'leads'            => $leads,
	'stats'            => $stats,
	'paths'            => $paths,
	'gmtOffsetMinutes' => (int) round( (float) get_option( 'gmt_offset', 0 ) * 60 ),
) );

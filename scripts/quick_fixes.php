<?php
wp_set_current_user(1);
global $wpdb;
$dry_run = getenv('CONFIRM') !== '1';
echo $dry_run ? "=== DRY RUN ===\n\n" : "=== LIVE ===\n\n";

// FIX 1: Grease category -> Nutrients
echo "=== FIX 1: GREASE CATEGORY ===\n";
$grease_cat = get_term_by('name', 'Grease', 'product_cat');
$nutrient_cat = null;
foreach (get_terms(array('taxonomy'=>'product_cat','hide_empty'=>false)) as $c) {
    if (strpos($c->name,'Nutrients')!==false && strpos($c->name,'Supplements')!==false) { $nutrient_cat=$c; break; }
}
if ($grease_cat && $nutrient_cat) {
    $gp = get_posts(array('post_type'=>'product','posts_per_page'=>-1,'fields'=>'ids',
        'tax_query'=>array(array('taxonomy'=>'product_cat','field'=>'term_id','terms'=>$grease_cat->term_id))));
    echo count($gp)." products\n";
    if (!$dry_run) {
        $gb = get_term_by('name','Grease','pwb-brand');
        if (!$gb) { $r=wp_insert_term('Grease','pwb-brand'); $gbid=$r['term_id']; } else { $gbid=$gb->term_id; }
        foreach ($gp as $pid) {
            wp_set_object_terms($pid,$nutrient_cat->term_id,'product_cat',true);
            wp_remove_object_terms($pid,$grease_cat->term_id,'product_cat');
            wp_set_object_terms($pid,$gbid,'pwb-brand',true);
        }
        wp_delete_term($grease_cat->term_id,'product_cat');
        echo "DONE\n";
    }
}

// FIX 2: Seed brands
echo "\n=== FIX 2: SEED BRANDS ===\n";
$seed_cat = get_term_by('name','Cannabis Seeds','product_cat');
if ($seed_cat) {
    $seeds = get_posts(array('post_type'=>'product','posts_per_page'=>-1,
        'tax_query'=>array(array('taxonomy'=>'product_cat','field'=>'term_id','terms'=>$seed_cat->term_id))));
    $sb = array(
        'Atlas Seed'=>array('banjerine','face fat','fog dog','froot by the foot','garlic jam','gmo 8+','gmo auto','gmo og','grease gun','gummibears','turtle taffy','blue dream auto','white widow auto','mendo breath'),
        'GreenHouse Seed'=>array('flowerbomb kush','holy punch','king\'s juice','money maker','neville\'s haze','super lemon haze','white rhino','super bud','chemdog','hawaiian snow','skunk auto','skywalker','nl5 haze','black toffee','blue haze','fullgas'),
    );
    $fixed=0;
    foreach ($sb as $bn=>$_) { if(!get_term_by('name',$bn,'pwb-brand')&&!$dry_run) wp_insert_term($bn,'pwb-brand'); }
    foreach ($seeds as $s) {
        $tl=strtolower($s->post_title); $correct=null;
        foreach ($sb as $b=>$ps) { foreach($ps as $p) { if(stripos($tl,$p)!==false){$correct=$b;break 2;} } }
        if (!$correct) continue;
        $cur=wp_get_object_terms($s->ID,'pwb-brand',array('fields'=>'names'));
        $cb=(!is_wp_error($cur)&&!empty($cur))?$cur[0]:'NONE';
        if ($cb!==$correct) {
            echo "  #{$s->ID} [{$cb}]->{$correct}\n";
            if (!$dry_run) { $bt=get_term_by('name',$correct,'pwb-brand'); if($bt) wp_set_object_terms($s->ID,array($bt->term_id),'pwb-brand',false); }
            $fixed++;
        }
    }
    echo "Fixed: {$fixed}\n";
}

// FIX 3: Athena brand
echo "\n=== FIX 3: ATHENA ===\n";
if (!get_term_by('name','Athena','pwb-brand')&&!$dry_run) wp_insert_term('Athena','pwb-brand');
$ab=get_term_by('name','Athena','pwb-brand');
if ($ab) {
    $aps=$wpdb->get_results("SELECT ID,post_title FROM {$wpdb->posts} WHERE post_type='product' AND post_status='publish' AND LOWER(post_title) LIKE '%athena%'");
    foreach ($aps as $p) {
        $cur=wp_get_object_terms($p->ID,'pwb-brand',array('fields'=>'names'));
        $cb=(!is_wp_error($cur)&&!empty($cur))?$cur[0]:'NONE';
        if ($cb!=='Athena') { echo "  #{$p->ID} [{$cb}]->Athena\n"; if(!$dry_run) wp_set_object_terms($p->ID,array($ab->term_id),'pwb-brand',false); }
    }
}

// FIX 4: Title-based corrections
echo "\n=== FIX 4: TITLE BRAND FIX ===\n";
$bp = array(
    'Nectar For The Gods'=>array('aphrodite','bloom khaos','gaia mania','herculean harvest','hygeia','mega morpheus','pegasus potion','posiedonzyme','zeus juice','the kraken','olympus up','hades down'),
    'Terpinator'=>array('terpinator'),
    'Growth Science'=>array('decision gallon','equinox gallon','autumn gallon','spring gallon','summer gallon','lightning start'),
);
$corr=0;
foreach ($bp as $cb=>$ps) {
    $bt=get_term_by('name',$cb,'pwb-brand');
    if(!$bt&&!$dry_run){$r=wp_insert_term($cb,'pwb-brand');if(!is_wp_error($r))$bt=get_term_by('term_id',$r['term_id'],'pwb-brand');}
    foreach ($ps as $pat) {
        $ms=$wpdb->get_results($wpdb->prepare("SELECT ID,post_title FROM {$wpdb->posts} WHERE post_type='product' AND post_status='publish' AND LOWER(post_title) LIKE %s",'%'.strtolower($pat).'%'));
        foreach ($ms as $m) {
            $cur=wp_get_object_terms($m->ID,'pwb-brand',array('fields'=>'names'));
            $cc=(!is_wp_error($cur)&&!empty($cur))?$cur[0]:'NONE';
            if(strtolower($cc)!==strtolower($cb)){echo "  #{$m->ID} [{$cc}]->{$cb}\n";if(!$dry_run&&$bt)wp_set_object_terms($m->ID,array($bt->term_id),'pwb-brand',false);$corr++;}
        }
    }
}
echo "Corrected: {$corr}\n";
echo "\n=== DONE ===\n";
if ($dry_run) echo "*** DRY RUN ***\n";
